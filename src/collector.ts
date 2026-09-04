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
}

interface ActiveMember {
  id: string;
  handle: string;
  goal: number;
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
    "SELECT id, handle, goal FROM members WHERE status = 'active'"
  ).all()) as { results: ActiveMember[] };

  const now = new Date();
  const hourUtc = hourOverride ?? now.getUTCHours();
  const sampled = shardMembersForHour(members, hourUtc);
  const nowIso = now.toISOString();
  const summary: CollectSummary = {
    ok: 0,
    failed: [],
    shard: { hourUtc, eligible: sampled.length, sampled: sampled.length },
  };

  for (const member of sampled) {
    try {
      const stats = await source.fetchStats(member.handle);
      await writeSnapshot(env, member.id, stats, nowIso);
      await checkMilestones(env, member.id, stats.followers, nowIso);
      await writeDailyStats(env, member.id, member.goal, stats.followers, nowIso);
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
  ctx?.waitUntil(
    purgeReadCaches([SITE_URL], sampled.map((m) => m.id)).catch(() => undefined)
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
  goal: number,
  latestFollowers: number,
  nowIso: string
): Promise<void> {
  const { results: rows } = await env.DB.prepare(
    "SELECT followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ?1 ORDER BY recorded_at DESC LIMIT 31"
  ).bind(memberId).all();
  const snapshots = (rows as never as Array<{ followers: number; recordedAt: string }>).slice().reverse();

  // 基线优先用该成员最早快照（窗口 31 条足够覆盖首月；更早的成员以 daily_stats 首条为准）
  const stats = computeMemberStats(
    { id: memberId, handle: "", displayName: null, goal, joinedAt: snapshots[0]?.recordedAt.slice(0, 10) ?? nowIso.slice(0, 10) },
    snapshots,
    nowIso
  );

  await env.DB.prepare(
    `INSERT INTO daily_stats (member_id, stats_date, followers, growth, growth7d, growth30d, progress, streak_days, achieved, overflow, updated_at)
     VALUES (?1, date(?2), ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?2)
     ON CONFLICT(member_id, stats_date) DO UPDATE SET
       followers = excluded.followers, growth = excluded.growth,
       growth7d = excluded.growth7d, growth30d = excluded.growth30d,
       progress = excluded.progress, streak_days = excluded.streak_days,
       achieved = excluded.achieved, overflow = excluded.overflow,
       updated_at = excluded.updated_at`
  ).bind(
    memberId,
    nowIso,
    stats.latestFollowers ?? latestFollowers,
    stats.growth,
    stats.growth7d,
    stats.growth30d,
    stats.progress,
    stats.streakDays,
    stats.achieved ? 1 : 0,
    stats.overflow
  ).run();
}
