/**
 * 每日信号同步（Worker cron，纯确定性计算）：成员被提及 + 社群信号（共同关注/品味）。
 * 复用 Worker 内 env.SOCIALDATA_API_KEY（线上 secret）直接调 SocialData、写 D1，
 * 把数据管线全部收敛进 Cloudflare——替代原先的本地脚本 + 本地自动化。
 * 被提及 = SocialData Search 按 @handle 拉站外提及；共同关注 = following 采样聚合；
 * 品味 = 帖子正文外部 @ 提及计数（纯库读零 API）。
 * 与分片采集共用同一把 key 与同一个全局熔断（collector 的 sd_circuit_open_until）：
 * 余额耗尽时两条通道一起停，不会一方停一方继续烧。
 */
import { resetCacheBustMemo } from "./cache";
import { sdBreakerOpen, tripBreaker } from "./collector";
import { SocialDataError, FETCH_TIMEOUT_MS } from "./sources/socialdata";

const API_BASE = "https://api.socialdata.tools";

/** 致命出站错误（余额/鉴权/限流）：立刻中止整轮并合闸，别再逐个成员打注定失败的请求 */
function isFatal(error: unknown): boolean {
  return (
    error instanceof SocialDataError &&
    (error.status === 401 || error.status === 402 || error.status === 403 || error.status === 429)
  );
}

/** 确定性字符串哈希（与 collector 分片同算法，把成员均匀分到 N 组轮转，控单轮调用规模与账单） */
function memberBucket(id: string, mod: number): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % mod;
}

interface SocialTweet {
  id_str?: string;
  tweet_created_at?: string;
  full_text?: string | null;
  user?: { screen_name?: string; name?: string } | null;
  author_handle?: string | null;
  author_name?: string | null;
}
interface SocialUser {
  screen_name?: string;
  name?: string | null;
}

/** SocialData 共享限流 120 req/min：本模块跑在 Worker 里与分片采集共用同一把 key。
 *  间隔取 850ms（≈70 req/min）留出余量——踩到 429 会触发全局熔断（冷却 1 小时），
 *  那比跑慢一点贵得多。两个同步任务必须串行调用（见 api.ts runScheduled），
 *  并发跑会让有效速率翻倍。 */
const THROTTLE_INTERVAL_MS = 850;

async function throttledGet<T>(env: Env, path: string): Promise<T> {
  const key = env.SOCIALDATA_API_KEY;
  if (!key) throw new Error("缺少 SOCIALDATA_API_KEY");
  await new Promise((r) => setTimeout(r, THROTTLE_INTERVAL_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted)
      throw new SocialDataError(`请求超时（${FETCH_TIMEOUT_MS / 1000}s）`, 0);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // 必须带 status 抛出：402（余额耗尽）/429（限流）要能被上层识别，
    // 旧实现抛 `new Error("HTTP " + status)` 把状态码丢进文案里，
    // 调用方只能把「余额耗尽」也当成「该成员失败」继续逐个打，白烧一小时
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new SocialDataError(`HTTP ${res.status} ${path}${body ? ` ${body}` : ""}`, res.status);
  }
  return res.json();
}

/** 数据版本 +1（本模块三轮同步各自收尾时调用一次，不逐条换键） */
async function bumpCacheBust(env: Env): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
  ).run(); // 本 isolate 立即读到新版本号（不等 5 秒记忆过期）
  resetCacheBustMemo();
}

/**
 * 成员被提及：按 3 天轮转分片遍历活跃成员（每人每 3 天完整刷新一次近 30 天站外被提及），
 * 较原先每日全量直省 ~67% SocialData 提及搜索调用，且避免成员规模扩大后单轮超时或与队列 cron 撞车。
 */
export async function syncMemberMentions(
  env: Env,
  opts?: { shardMod?: number; shardIndex?: number },
): Promise<{ ok: number; total: number }> {
  // 熔断期内不发出站请求（余额疑似耗尽；等冷却结束或人工处理）
  if (await sdBreakerOpen(env)) {
    console.warn("[sync-signals] 熔断打开，本轮被提及同步跳过");
    return { ok: 0, total: 0 };
  }
  const { results: allMembers } = await env.DB.prepare(
    "SELECT id, handle FROM members WHERE status = 'active'",
  ).all<{ id: string; handle: string }>();
  const shardMod = Math.max(1, opts?.shardMod ?? 3);
  const shardIndex = opts?.shardIndex ?? Math.floor(Date.now() / 86_400_000) % shardMod;
  const members =
    shardMod > 1
      ? allMembers.filter((m) => memberBucket(m.id, shardMod) === shardIndex)
      : allMembers;
  const stmt = env.DB.prepare(
    // DO NOTHING 而非 REPLACE：REPLACE 会把已入库行的 collected_at 刷成本次时间，
    // 丢掉「首次看到该提及」的语义（本地脚本 scripts/sync-member-mentions.mjs 同口径）
    `INSERT INTO member_mentions (member_id, tweet_id, author_handle, author_name, text, mentioned_at, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(member_id, tweet_id) DO NOTHING`,
  );
  const now = new Date().toISOString();
  let total = 0;
  let ok = 0;
  for (const m of members) {
    try {
      const query = encodeURIComponent(`@${m.handle} -filter:replies`);
      const page = await throttledGet<{ tweets?: SocialTweet[] }>(
        env,
        `/twitter/search?query=${query}&type=Latest`,
      );
      const tweets = Array.isArray(page.tweets) ? page.tweets : [];
      const batch = [];
      for (const t of tweets) {
        if (!t.id_str) continue;
        // mentioned_at 是 NOT NULL 列：缺 created_at 的脏行跳过，否则整个 batch 抛错、该成员本轮全丢
        if (!t.tweet_created_at) {
          console.error(
            `[sync-signals] ${m.handle} 提及 tweet ${t.id_str} 缺 tweet_created_at，跳过`,
          );
          continue;
        }
        const author = (t.user?.screen_name || t.author_handle || "").toLowerCase();
        if (author === m.handle.toLowerCase()) continue; // 本人自提不算「被提及」
        batch.push(
          stmt.bind(
            m.id,
            t.id_str,
            t.user?.screen_name || t.author_handle || null,
            t.user?.name || t.author_name || null,
            t.full_text ?? null,
            t.tweet_created_at,
            now,
          ),
        );
        total++;
      }
      if (batch.length) await env.DB.batch(batch);
      ok++;
    } catch (error) {
      if (isFatal(error)) {
        // 余额/鉴权/限流问题：剩余成员注定同样失败，立即合闸 + 中止本轮
        await tripBreaker(env, `被提及同步 @${m.handle} HTTP ${(error as SocialDataError).status}`);
        console.error(
          "[sync-signals] 余额/鉴权/限流错误，中止本轮被提及同步：",
          error instanceof Error ? error.message : error,
        );
        break;
      }
      /* 单成员失败跳过，不阻塞整轮；留一行日志避免静默丢数据 */
      console.error(
        `[sync-signals] 成员 ${m.handle} 提及同步失败:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (ok > 0) await bumpCacheBust(env);
  return { ok, total };
}

/** 社群信号：共同关注（following 采样头部 8 位）+ 社群品味（帖子正文外部提及计数） */
export async function syncCommunitySignals(
  env: Env,
): Promise<{ following: number; taste: number }> {
  const { results: members } = await env.DB.prepare(
    `SELECT m.id, m.handle, m.user_id,
            (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id ORDER BY s.recorded_at DESC LIMIT 1) AS f
     FROM members m WHERE m.status = 'active'`,
  ).all<{ id: string; handle: string; user_id: string | null; f: number | null }>();
  const top = members
    .filter((m) => m.user_id)
    .toSorted((a, b) => (b.f ?? 0) - (a.f ?? 0))
    .slice(0, 8);

  // 共同关注：有多少位成员共同关注同一个外部大V
  const followingCount = new Map<string, { name: string | null; set: Set<string> }>();
  let breakerTripped = await sdBreakerOpen(env);
  for (const m of top) {
    if (breakerTripped) {
      console.warn("[sync-signals] 熔断打开，剩余共同关注采样跳过");
      break;
    }
    try {
      const page = await throttledGet<{ users?: SocialUser[] }>(
        env,
        `/twitter/user/${m.user_id}/following`,
      );
      const users = Array.isArray(page.users) ? page.users : [];
      for (const u of users) {
        const h = (u.screen_name || "").toLowerCase();
        if (!h) continue;
        const rec = followingCount.get(h) ?? { name: u.name ?? null, set: new Set<string>() };
        rec.set.add(m.id);
        followingCount.set(h, rec);
      }
    } catch (error) {
      if (isFatal(error)) {
        await tripBreaker(
          env,
          `共同关注采样 @${m.handle} HTTP ${(error as SocialDataError).status}`,
        );
        breakerTripped = true;
        console.error(
          "[sync-signals] 余额/鉴权/限流错误，中止共同关注采样：",
          error instanceof Error ? error.message : error,
        );
        break;
      }
      /* 单成员跳过，不阻塞整轮；留一行定位失败样本 */
      console.error(
        `[sync-signals] 成员 ${m.handle} 共同关注采样失败:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // 社群品味：帖子正文里被提及最多的外部账号（排除成员自身，零额外 API）。
  // 只读近 30 天窗口且严格限定活跃成员：已离场/冻结成员的残留帖子不得污染社群品味。
  // 排除集必须用**全部**活跃成员，而不是上面那个 8 人采样——否则其余成员之间的
  // 内部互提会被当成「外部品味」信号
  const { results: posts } = await env.DB.prepare(
    `SELECT p.text FROM posts p
     JOIN members m ON m.id = p.member_id
     WHERE m.status = 'active' AND p.created_at >= ?1`,
  )
    .bind(new Date(Date.now() - 30 * 86_400_000).toISOString())
    .all<{ text: string | null }>();
  const memberHandles = new Set(members.map((m) => m.handle.toLowerCase()));
  const tasteCount = new Map<string, number>();
  for (const r of posts) {
    if (!r.text) continue;
    const matches = r.text.toLowerCase().match(/@([a-z0-9_]{2,30})/g) ?? [];
    for (const raw of matches) {
      const h = raw.slice(1);
      if (memberHandles.has(h)) continue;
      tasteCount.set(h, (tasteCount.get(h) ?? 0) + 1);
    }
  }
  const tasteTop = [...tasteCount.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, 30);

  const stmt = env.DB.prepare(
    "INSERT OR REPLACE INTO community_signal_counts (kind, handle, name, count, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  const now = new Date().toISOString();
  const followingRows = [];
  for (const [handle, rec] of followingCount) {
    if (rec.set.size >= 2)
      followingRows.push(stmt.bind("following", handle, rec.name, rec.set.size, now));
  }
  const tasteRows = tasteTop.map(([handle, count]) => stmt.bind("taste", handle, null, count, now));

  // 按 kind 独立原子替换：熔断或采样失败导致 following 为空时，绝不连带清空历史共同关注数据
  const ops = [];
  if (followingRows.length > 0) {
    ops.push(
      env.DB.prepare("DELETE FROM community_signal_counts WHERE kind = 'following'"),
      ...followingRows,
    );
  }
  if (tasteRows.length > 0) {
    ops.push(
      env.DB.prepare("DELETE FROM community_signal_counts WHERE kind = 'taste'"),
      ...tasteRows,
    );
  }
  if (ops.length > 0) {
    await env.DB.batch(ops);
    await bumpCacheBust(env);
  }
  return {
    following: followingRows.length,
    taste: tasteRows.length,
  };
}
