import { detectMilestones, UNIFORM_THRESHOLDS } from "./milestones";
import type { RosterFile } from "./roster";
import { roster, syncRoster } from "./roster";
import { getSource } from "./sources";
import type { FollowerSource, FollowerStats } from "./sources/types";
import { purgeReadCaches } from "./cache";
import { computeMemberStats } from "./stats";
import { SITE_URL } from "./lib/site";

export interface CollectSummary {
  ok: number;
  failed: Array<{ handle: string; error: string }>;
  /** 滚动采集分片信息 */
  shard?: { hourUtc: number; eligible: number; sampled: number };
  /** 自助更新队列兜底清空结果 */
  refreshQueue?: { ok: number; failed: number; drained: number };
}

interface ActiveMember {
  id: string;
  handle: string;
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
 * 3. 检测登阶（均匀成就阶梯）、写 daily_stats 预聚合
 * 4. 记录同步结果、清读缓存
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
  // 数据源内置的节流在两次调用间统一生效
  const refreshDrain = await drainRefreshQueue(env, source);

  const now = new Date();
  const hourUtc = hourOverride ?? now.getUTCHours();
  const sampled = shardMembersForHour(members, hourUtc);
  const nowIso = now.toISOString();
  const summary: CollectSummary = {
    ok: 0,
    failed: [],
    shard: { hourUtc, eligible: sampled.length, sampled: sampled.length },
    refreshQueue: { ok: refreshDrain.ok, failed: refreshDrain.failed, drained: refreshDrain.memberIds.length },
  };

  for (const member of sampled) {
    try {
      const stats = await source.fetchStats(member.handle);
      await writeSnapshot(env, member.id, stats, nowIso);
      await checkMilestones(env, member.id, stats.followers, nowIso);
      await writeDailyStats(env, member.id, stats.followers, nowIso);
      summary.ok++;
    } catch (error) {
      summary.failed.push({
        handle: member.handle,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[collect] @${member.handle} 采集失败：`, error);
    }
  }

  await env.DB.prepare(
    `INSERT INTO site_meta (key, value) VALUES ('last_sync_at', ?1), ('last_sync_summary', ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(nowIso, JSON.stringify(summary)).run();

  // 采集完成后尽力清读缓存：看板/成员页/卡片立刻反映新数据（清不到的边缘节点等 TTL 过期）
  // 队列清空处理的成员一并纳入，提交即时通道的同批请求也能看到
  ctx?.waitUntil(
    purgeReadCaches(
      [SITE_URL],
      [...sampled.map((m) => m.id), ...refreshDrain.memberIds]
    ).catch(() => undefined)
  );

  return summary;
}

/** 写当日快照：同一天重复采集以最新值为准 */
async function writeSnapshot(
  env: Env,
  memberId: string,
  stats: FollowerStats,
  now: string
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM snapshots WHERE member_id = ?1 AND date(recorded_at) = date(?2)"
    ).bind(memberId, now),
    env.DB.prepare(
      "INSERT INTO snapshots (member_id, followers, following, posts, recorded_at) VALUES (?1, ?2, ?3, ?4, ?5)"
    ).bind(memberId, stats.followers, stats.following ?? null, stats.posts ?? null, now),
    // 头像随采随更（不落快照，展示当前头像即可）
    env.DB.prepare("UPDATE members SET profile_image = ?1, updated_at = datetime('now') WHERE id = ?2").bind(
      stats.profileImageUrl ?? null,
      memberId
    ),
  ]);
}

/** 与本次采集之前的最新快照对比，写入新跨过的台阶（均匀成就阶梯） */
async function checkMilestones(
  env: Env,
  memberId: string,
  followers: number,
  now: string
): Promise<void> {
  const prev = (await env.DB.prepare(
    "SELECT followers FROM snapshots WHERE member_id = ?1 AND recorded_at < ?2 ORDER BY recorded_at DESC LIMIT 1"
  ).bind(memberId, now).first()) as { followers: number } | null;

  const events = detectMilestones(prev?.followers, followers, UNIFORM_THRESHOLDS, now);
  for (const event of events) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO milestones (member_id, threshold, achieved_at, announced) VALUES (?1, ?2, ?3, 1)"
    ).bind(memberId, event.threshold, event.achievedAt).run();
  }
  // 公告机制：把最新跨过的档位写入 site_meta（首页「最新达成」展示源）。
  // announced=1 表示已入公告流；未来接入推文/Newsletter 播报时复用此标记。
  if (events.length > 0) {
    const latest = events[events.length - 1];
    await env.DB.prepare(
      `INSERT INTO site_meta (key, value) VALUES ('latest_milestone', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(
      JSON.stringify({ memberId, threshold: latest.threshold, achievedAt: latest.achievedAt })
    ).run();
  }
}

/**
 * 写每日统计预聚合（一行一人一天，幂等覆盖）：
 * 数据来自最近 31 条快照窗口（走索引），看板/卡片直接读此表，
 * 行读取 O(成员) 且不随历史增长。
 */
async function writeDailyStats(
  env: Env,
  memberId: string,
  latestFollowers: number,
  nowIso: string
): Promise<void> {
  const { results: rows } = await env.DB.prepare(
    "SELECT followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ?1 ORDER BY recorded_at DESC LIMIT 31"
  ).bind(memberId).all();
  const snapshots = (rows as never as Array<{ followers: number; recordedAt: string }>).slice().reverse();

  // 基线优先用该成员最早快照（窗口 31 条足够覆盖首月；更早的成员以 daily_stats 首条为准）
  const stats = computeMemberStats(
    { id: memberId, handle: "", displayName: null, joinedAt: snapshots[0]?.recordedAt.slice(0, 10) ?? nowIso.slice(0, 10) },
    snapshots,
    nowIso
  );

  await env.DB.prepare(
    `INSERT INTO daily_stats (member_id, stats_date, followers, growth, growth7d, growth30d, updated_at)
     VALUES (?1, date(?2), ?3, ?4, ?5, ?6, ?2)
     ON CONFLICT(member_id, stats_date) DO UPDATE SET
       followers = excluded.followers, growth = excluded.growth,
       growth7d = excluded.growth7d, growth30d = excluded.growth30d,
       updated_at = excluded.updated_at`
  ).bind(
    memberId,
    nowIso,
    stats.latestFollowers ?? latestFollowers,
    stats.growth,
    stats.growth7d,
    stats.growth30d
  ).run();
}

/* ============ 自助更新队列消费（即时通道 + 兜底通道共用） ============ */

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

/** 处理一条 pending：拉真实数据 → 复用与 cron 采集完全相同的写入管线 → 标记结果 */
async function processRefreshJob(
  env: Env,
  source: FollowerSource,
  jobId: number,
  memberId: string
): Promise<boolean> {
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
    await writeSnapshot(env, memberId, stats, nowIso);
    await checkMilestones(env, memberId, stats.followers, nowIso);
    await writeDailyStats(env, memberId, stats.followers, nowIso);
    await env.DB.prepare(
      "UPDATE refresh_queue SET status = 'done', processed_at = ?2, followers_after = ?3, error = NULL WHERE id = ?1"
    ).bind(jobId, nowIso, stats.followers).run();
    return true;
  } catch (error) {
    // 保留 pending 供下次提交/cron 重试；累计超过上限转 failed
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const row = (await env.DB.prepare(
      "SELECT attempts FROM refresh_queue WHERE id = ?1 AND status = 'pending'"
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
    }
  }
  return summary;
}
