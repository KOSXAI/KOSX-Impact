import { detectMilestones, MILESTONE_THRESHOLDS } from "./milestones";
import type { RosterFile } from "./roster";
import { roster, syncRoster } from "./roster";
import { getSource } from "./sources";
import { SocialDataError } from "./sources/socialdata";
import type { FollowerSource, FollowerStats, PostData } from "./sources/types";

export interface CollectSummary {
  ok: number;
  failed: Array<{ handle: string; error: string }>;
  /** 滚动采集分片信息 */
  shard?: { hourUtc: number; eligible: number; sampled: number };
  /** 自助更新队列兜底清空结果 */
  refreshQueue?: { ok: number; failed: number; drained: number };
  /** 帖子采集结果（profile 响应含数字 ID 才拉帖子） */
  posts?: { ok: number; failed: number; upserted: number; cleaned: number };
}

interface ActiveMember {
  id: string;
  handle: string;
}

/** 帖子保留窗口：精华帖近 30 天，90 天保留 3 倍余量，控表增长 */
const POST_RETENTION_DAYS = 90;

/** 社群级熔断：连吃 402（余额耗尽）后整点/兜底通道停止出站烧钱，1 小时后自动恢复 */
const BREAKER_KEY = "sd_circuit_open_until";
const BREAKER_COOLDOWN_MS = 3_600_000;

/** 熔断是否处于打开状态（打开 = SocialData 余额疑似耗尽，跳过一切出站调用） */
export async function sdBreakerOpen(env: Env): Promise<boolean> {
  const row = (await env.DB.prepare("SELECT value FROM site_meta WHERE key = ?1").bind(BREAKER_KEY)
    .first()) as { value: string } | null;
  return row != null && new Date(row.value).getTime() > Date.now();
}

/** 拉 402 时合闸：接下来的 1 小时不再对 SocialData 发任何请求（分片/兜底双通道都跳过） */
async function tripBreaker(env: Env): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO site_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(BREAKER_KEY, new Date(Date.now() + BREAKER_COOLDOWN_MS).toISOString()).run();
}

/**
 * 滚动采集分片：成员按 id 哈希均匀分布到 24 个小时槽，每次 cron 只采当前小时槽。
 * 单次调用的子请求数和时长与总人数无关（每人 ≈ 4 子请求 + 20 秒节流），
 * 免费版限制（50 子请求/次、15 分钟 cron）撞不到；每人每天依然被采一次。
 */
export function shardMembersForHour<T extends { id: string }>(members: T[], hourUtc: number): T[] {
  return members.filter((m) => {
    let hash = 0;
    for (const ch of m.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return hash % 24 === ((hourUtc % 24) + 24) % 24;
  });
}

/**
 * 采集入口，由 Cron Trigger（wrangler.jsonc 中的 crons）调用：
 * 1. 同步成员名册（data/members.json 是追踪名单的事实来源）
 * 2. 取当前 UTC 小时的成员分片，逐个拉取粉丝量写快照
 * 3. 检测登阶（称号大关）
 * 4. 记录同步结果
 */
export async function collect(env: Env, ctx?: ExecutionContext): Promise<CollectSummary> {
  return collectWithSource(env, getSource(env), roster, ctx);
}

export async function collectWithSource(
  env: Env,
  source: FollowerSource,
  rosterFile: RosterFile = roster,
  ctx?: ExecutionContext,
  /** 覆盖当前 UTC 小时（测试用）；缺省取真实时间 */
  hourOverride?: number
): Promise<CollectSummary> {
  await syncRoster(env, rosterFile);

  const { results: members } = (await env.DB.prepare(
    "SELECT id, handle FROM members WHERE status = 'active'"
  ).all()) as { results: ActiveMember[] };

  // 兜底通道：先清自助更新队列（FIFO、小批量），与分片采集共用同一数据源实例，
  // 数据源内置的节流在两次调用间统一生效；熔断打开时两通道一起短路，不烧余额
  const breakerOpen = await sdBreakerOpen(env);
  if (breakerOpen) console.warn(`[collect] SocialData 熔断打开（402 冷却中），本轮跳过全部出站采集`);
  const refreshDrain = breakerOpen
    ? { ok: 0, failed: 0, memberIds: [] as string[] }
    : await drainRefreshQueue(env, source);

  const now = new Date();
  const hourUtc = hourOverride ?? now.getUTCHours();
  const sampled = shardMembersForHour(members, hourUtc);
  const nowIso = now.toISOString();
  const summary: CollectSummary = {
    ok: 0,
    failed: [],
    shard: { hourUtc, eligible: sampled.length, sampled: sampled.length },
    refreshQueue: { ok: refreshDrain.ok, failed: refreshDrain.failed, drained: refreshDrain.memberIds.length },
    posts: { ok: 0, failed: 0, upserted: 0, cleaned: 0 },
  };

  for (const member of sampled) {
    // 余额耗尽即合闸：本轮剩余成员与后续 cron 都跳过，直到冷却结束（避免 402 死循环烧钱）
    if (await sdBreakerOpen(env)) {
      summary.shard!.sampled = summary.ok + summary.failed.length;
      console.warn(`[collect] 熔断打开，分片提前收车（已采 ${summary.ok}/失败 ${summary.failed.length}）`);
      break;
    }
    try {
      const stats = await source.fetchStats(member.handle);
      await writeSnapshot(env, member.id, stats, nowIso);
      await checkMilestones(env, member.id, stats.followers, nowIso);
      summary.ok++;
      // 帖子采集：profile 响应携带数字 ID（id_str），复用免额外调用
      if (stats.userId) {
        try {
          const posts = await source.fetchRecentPosts(stats.userId);
          const cleaned = await writeRecentPosts(env, member.id, posts, nowIso);
          summary.posts!.ok++;
          summary.posts!.upserted += posts.length;
          summary.posts!.cleaned += cleaned;
        } catch (error) {
          if (error instanceof SocialDataError && (error.status === 402 || error.status === 429)) throw error;
          summary.posts!.failed++;
          console.error(`[collect] @${member.handle} 帖子采集失败：`, error);
        }
      }
    } catch (error) {
      summary.failed.push({
        handle: member.handle,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[collect] @${member.handle} 采集失败：`, error);
      if (error instanceof SocialDataError && (error.status === 402 || error.status === 429)) {
        await tripBreaker(env);
        break;
      }
    }
  }

  // 控表增长：过期 done/failed 清理 + 卡死 processing 回收（无论熔断与否都执行，纯本地写）
  await pruneRefreshQueue(env);

  // 新数据可见性由 cache_bust 版本号保证（writeSnapshot 已 +1）：
  // 读端点缓存键换新后各数据中心新请求必然回源重建，无需（也无法）跨区 purge
  return summary;
}

/** 写当日快照：当日已有快照（cron 先写过）时不删不重建，原位 UPSERT 单行——
 *  自助刷新既保住当日数据点的存在（旧 delete+insert 会让曲线当天只剩一个点），
 *  又以最新值覆盖（growth 曲线当日点始终是最新一次采集值）。
 *  昵称策略（与头像同语句更新）：自助成员（self_registered=1）跟随 X 实时昵称，
 *  名册成员以名册为准、仅在缺失时回填 X 昵称。
 *  同批内递增 cache_bust：读端点缓存键随之换新，数据变化在各区数据中心立即可见。 */
async function writeSnapshot(
  env: Env,
  memberId: string,
  stats: FollowerStats,
  now: string
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO snapshots (member_id, followers, following, posts, listed_count, favourites_count, recorded_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(member_id, date(recorded_at)) DO UPDATE SET
         followers = excluded.followers,
         following = excluded.following,
         posts = excluded.posts,
         listed_count = excluded.listed_count,
         favourites_count = excluded.favourites_count,
         recorded_at = excluded.recorded_at`
    ).bind(
      memberId,
      stats.followers,
      stats.following ?? null,
      stats.posts ?? null,
      stats.listedCount ?? null,
      stats.favouritesCount ?? null,
      now
    ),
    env.DB.prepare(
      `UPDATE members SET
         display_name = CASE
           WHEN self_registered = 1 THEN COALESCE(?2, display_name)
           ELSE COALESCE(display_name, ?2)
         END,
         profile_image = ?3,
         bio = COALESCE(?4, bio),
         location = COALESCE(?5, location),
         url = COALESCE(?6, url),
         banner_url = COALESCE(?7, banner_url),
         x_created_at = COALESCE(?8, x_created_at),
         verified = COALESCE(?9, verified),
         user_id = COALESCE(?10, user_id),
         updated_at = datetime('now')
       WHERE id = ?1`
    ).bind(
      memberId,
      stats.displayName ?? null,
      stats.profileImageUrl ?? null,
      stats.bio ?? null,
      stats.location ?? null,
      stats.url ?? null,
      stats.bannerUrl ?? null,
      stats.xCreatedAt ?? null,
      stats.verified == null ? null : stats.verified ? 1 : 0,
      stats.userId ?? null
    ),
    env.DB.prepare(
      `INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
       ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`
    ),
  ]);
}

/** 与本次采集之前的最新快照对比，写入新跨过的大关（称号大关表）。
 *  首个快照没有「之前」：加入时刻已达到的大关当场补授——否则中高粉成员
 *  上一道大关早在加入前就过了，第一枚徽章要等几个月，徽章墙长期空转。 */
async function checkMilestones(
  env: Env,
  memberId: string,
  followers: number,
  now: string
): Promise<void> {
  const prev = (await env.DB.prepare(
    "SELECT followers FROM snapshots WHERE member_id = ?1 AND recorded_at < ?2 ORDER BY recorded_at DESC LIMIT 1"
  ).bind(memberId, now).first()) as { followers: number } | null;

  const events = prev
    ? detectMilestones(prev.followers, followers, MILESTONE_THRESHOLDS, now)
    : MILESTONE_THRESHOLDS
        .filter((t) => t <= followers)
        .map((threshold) => ({ threshold, achievedAt: now }));
  for (const event of events) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO milestones (member_id, threshold, achieved_at, announced) VALUES (?1, ?2, ?3, 1)"
    ).bind(memberId, event.threshold, event.achievedAt).run();
  }
  // announced=1 标记该登阶已计入公告流（首页「最新达成」读 milestones 表）；
  // 未来接入推文播报等渠道时复用此标记
}


/**
 * 写入成员最近帖子（posts 表批量 upsert，tweet_id 幂等）+ 清理超期旧帖。
 * tweet_id 相同即覆盖——同一天重复采集以最新互动值为准，老帖互动继续上涨也能更新。
 * 返回清理删除的行数。cache_bust 由 writeSnapshot 统一 +1，这里不重复。
 */
async function writeRecentPosts(
  env: Env,
  memberId: string,
  posts: PostData[],
  nowIso: string
): Promise<number> {
  if (posts.length === 0) return 0;
  // 幂等 upsert（不用 REPLACE——REPLACE 删旧重建会丢 views_prev）：已存在的行把旧 views 挪进 views_prev
  const stmt = env.DB.prepare(
    `INSERT INTO posts
       (tweet_id, member_id, created_at, views_count, views_prev,
        like_count, reply_count, retweet_count, quote_count, bookmark_count,
        text, lang, media, tweet_type, quoted, recorded_at)
     VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
     ON CONFLICT(tweet_id) DO UPDATE SET
       views_count = excluded.views_count,
       views_prev = posts.views_count,
       like_count = excluded.like_count,
       reply_count = excluded.reply_count,
       retweet_count = excluded.retweet_count,
       quote_count = excluded.quote_count,
       bookmark_count = excluded.bookmark_count,
       text = excluded.text,
       lang = excluded.lang,
       media = excluded.media,
       tweet_type = excluded.tweet_type,
       quoted = excluded.quoted,
       recorded_at = excluded.recorded_at`
  );
  const writes = posts.map((p) =>
    stmt.bind(
      p.tweetId,
      memberId,
      p.createdAt,
      p.views,
      p.likes,
      p.replies,
      p.retweets,
      p.quotes,
      p.bookmarks,
      p.fullText,
      p.lang,
      p.media ? JSON.stringify(p.media) : null,
      p.tweetType,
      p.quoted ? JSON.stringify(p.quoted) : null,
      nowIso
    )
  );
  // 清理保留窗口外的旧帖（精华帖近 30 天，90 天 3 倍余量），控表增长
  const cutoff = new Date(Date.now() - POST_RETENTION_DAYS * 86_400_000).toISOString();
  writes.push(env.DB.prepare("DELETE FROM posts WHERE member_id = ?1 AND created_at < ?2").bind(memberId, cutoff));
  await env.DB.batch(writes);
  return 0; // 清理行数由调用方无需感知，保留返回值供未来统计
}

/* ============ 自助更新队列消费（即时通道 + 兜底通道共用） ============ */

/**
 * 把一次已拉取的真实数据完整写入管线：快照（含昵称/头像 + cache_bust）+ 登阶检测 + 日聚合。
 * cron 采集、队列消费、注册当场校验三条路径复用同一写入逻辑，保证数据口径一致。
 * 传入 source 且 profile 响应含数字 ID 时，同步刷新帖子数据（与 cron 同链路）。
 */
export async function applyFollowerStats(
  env: Env,
  memberId: string,
  stats: FollowerStats,
  nowIso: string,
  source?: FollowerSource
): Promise<void> {
  await writeSnapshot(env, memberId, stats, nowIso);
  await checkMilestones(env, memberId, stats.followers, nowIso);
  if (source && stats.userId) {
    try {
      const posts = await source.fetchRecentPosts(stats.userId);
      await writeRecentPosts(env, memberId, posts, nowIso);
    } catch (error) {
      // 帖子刷新失败不影响快照结果（快照已写库）；日志记录供诊断
      console.error(`[collect] @${memberId} 帖子刷新失败（不影响快照）：`, error);
    }
  }
}

/** 单条失败重试上限：超过转 failed，等待成员重新提交 */
const REFRESH_MAX_ATTEMPTS = 3;
/** cron 每次兜底清空的最大条数：每条 ≈ 8 个子请求，给分片采集留出免费版 50 子请求的余量 */
export const REFRESH_DRAIN_LIMIT = 5;

export interface RefreshDrainResult {
  ok: number;
  failed: number;
  /** 成功处理的成员 id（供调用方清读缓存） */
  memberIds: string[];
}

/** 处理一条 pending：先原子领取（status→processing，即时通道与 cron 兜底并发抢同一 job 时
 *  只有一方 changes=1 生效，杜绝双方同时拉 SocialData 双份扣额度），再拉真实数据写库。
 *  领取后崩溃的 job 由 collect 的过期清理回收。 */
async function processRefreshJob(
  env: Env,
  source: FollowerSource,
  jobId: number,
  memberId: string
): Promise<boolean> {
  const claim = await env.DB.prepare(
    "UPDATE refresh_queue SET status = 'processing' WHERE id = ?1 AND status = 'pending'"
  ).bind(jobId).run();
  if ((claim.meta.changes ?? 0) === 0) return false;

  const member = (await env.DB.prepare(
    "SELECT handle FROM members WHERE id = ?1 AND status = 'active'"
  ).bind(memberId).first()) as { handle: string } | null;
  if (!member) {
    await env.DB.prepare(
      "UPDATE refresh_queue SET status = 'failed', processed_at = ?2, error = 'member not active' WHERE id = ?1"
    ).bind(jobId, new Date().toISOString()).run();
    return false;
  }

  const nowIso = new Date().toISOString();
  try {
    const stats = await source.fetchStats(member.handle);
    // 帖子采集已并入 applyFollowerStats（source 传入时同步刷新）
    await applyFollowerStats(env, memberId, stats, nowIso, source);
    await env.DB.prepare(
      "UPDATE refresh_queue SET status = 'done', processed_at = ?2, followers_after = ?3, error = NULL WHERE id = ?1"
    ).bind(jobId, nowIso, stats.followers).run();
    return true;
  } catch (error) {
    // 保留 pending 供下次提交/cron 重试；累计超过上限转 failed
    // （job 已被本协程领取为 processing，读取以 processing 判位）
    if (error instanceof SocialDataError && (error.status === 402 || error.status === 429)) {
      await env.DB.prepare(
        "UPDATE refresh_queue SET status = 'pending', processed_at = NULL, error = ?2 WHERE id = ?1"
      ).bind(jobId, `${String(error.message).slice(0, 200)}（额度/限流，留队待恢复）`).run();
      await tripBreaker(env);
      return false;
    }
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const row = (await env.DB.prepare(
      "SELECT attempts FROM refresh_queue WHERE id = ?1 AND status = 'processing'"
    ).bind(jobId).first()) as { attempts: number } | null;
    if (!row) return false;
    await env.DB.prepare(
      "UPDATE refresh_queue SET attempts = ?2, error = ?3, status = ?4 WHERE id = ?1"
    ).bind(
      jobId,
      row.attempts + 1,
      message,
      row.attempts + 1 >= REFRESH_MAX_ATTEMPTS ? "failed" : "pending"
    ).run();
    return false;
  }
}

/** 即时通道：处理最旧的一条 pending（队列空时通常就是刚提交的那条），有就返回 true */
export async function processOldestPending(env: Env, source: FollowerSource): Promise<boolean> {
  const job = (await env.DB.prepare(
    "SELECT id, member_id AS memberId FROM refresh_queue WHERE status = 'pending' ORDER BY requested_at, id LIMIT 1"
  ).first()) as { id: number; memberId: string } | null;
  if (!job) return false;
  return processRefreshJob(env, source, job.id, job.memberId);
}

/** 兜底通道：cron 每次运行开头按 FIFO 清一小批 pending */
export async function drainRefreshQueue(
  env: Env,
  source: FollowerSource,
  limit: number = REFRESH_DRAIN_LIMIT
): Promise<RefreshDrainResult> {
  if (await sdBreakerOpen(env)) return { ok: 0, failed: 0, memberIds: [] };
  const { results: jobs } = (await env.DB.prepare(
    "SELECT id, member_id AS memberId FROM refresh_queue WHERE status = 'pending' ORDER BY requested_at, id LIMIT ?"
  ).bind(limit).all()) as { results: Array<{ id: number; memberId: string }> };

  const summary: RefreshDrainResult = { ok: 0, failed: 0, memberIds: [] };
  for (const job of jobs) {
    const ok = await processRefreshJob(env, source, job.id, job.memberId);
    if (ok) {
      summary.ok++;
      summary.memberIds.push(job.memberId);
    } else {
      summary.failed++;
      // 熔断被本轮失败合闸：收车，剩余 job 留队待冷却后重试
      if (await sdBreakerOpen(env)) break;
    }
  }
  return summary;
}

/** 定期清理（collect 每 cron 调用）：
 *  - done/failed 行只保留 30 天（lookupRefreshMember 的 lastProcessedAt 读 MAX(done)，不受影响）
 *  - 领取后崩溃卡死在 processing 的 job 回收为 failed（领取超 1 小时-page 未落结果） */
async function pruneRefreshQueue(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM refresh_queue WHERE status NOT IN ('pending','processing')
       AND processed_at IS NOT NULL AND julianday(processed_at) < julianday('now', '-30 days')`
    ),
    env.DB.prepare(
      `UPDATE refresh_queue SET status = 'failed', error = '处理超时回收'
       WHERE status = 'processing' AND julianday(requested_at) < julianday('now', '-1 hour')`
    ),
  ]);
}
