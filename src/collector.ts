import { detectMilestones, thresholdsForGoal } from "./milestones";
import type { RosterFile } from "./roster";
import { roster, syncRoster } from "./roster";
import { getSource } from "./sources";
import type { FollowerSource, FollowerStats } from "./sources/types";
import { purgeReadCaches } from "./cache";

export interface CollectSummary {
  ok: number;
  failed: Array<{ handle: string; error: string }>;
}

interface ActiveMember {
  id: string;
  handle: string;
  goal: number;
}

/**
 * 每日数据采集入口，由 Cron Trigger（wrangler.jsonc 中的 crons）调用：
 * 1. 同步成员名册（data/members.json 是追踪名单的事实来源）
 * 2. 逐个成员拉取最新粉丝量并写入当日快照
 * 3. 检测跨过的里程碑档位
 * 4. 把同步结果写入 site_meta
 */
export async function collect(env: Env, ctx?: ExecutionContext): Promise<CollectSummary> {
  return collectWithSource(env, getSource(env), roster, ctx);
}

export async function collectWithSource(
  env: Env,
  source: FollowerSource,
  rosterFile: RosterFile = roster,
  ctx?: ExecutionContext
): Promise<CollectSummary> {
  await syncRoster(env, rosterFile);

  const { results: members } = (await env.DB.prepare(
    "SELECT id, handle, goal FROM members WHERE status = 'active'"
  ).all()) as { results: ActiveMember[] };

  const now = new Date().toISOString();
  const summary: CollectSummary = { ok: 0, failed: [] };

  for (const member of members) {
    try {
      const stats = await source.fetchStats(member.handle);
      await writeSnapshot(env, member.id, stats, now);
      await checkMilestones(env, member.id, member.goal, stats.followers, now);
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
  ).bind(now, JSON.stringify(summary)).run();

  // 采集完成后尽力清读缓存：看板/卡片立刻反映新数据（清不到的边缘节点等 TTL 过期）
  ctx?.waitUntil(purgeReadCaches(["https://10k.kosx.ai"]).catch(() => undefined));

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
  ]);
}

/** 与本次采集之前的最新快照对比，写入新跨过的里程碑 */
async function checkMilestones(
  env: Env,
  memberId: string,
  goal: number,
  followers: number,
  now: string
): Promise<void> {
  const prev = (await env.DB.prepare(
    "SELECT followers FROM snapshots WHERE member_id = ?1 AND recorded_at < ?2 ORDER BY recorded_at DESC LIMIT 1"
  ).bind(memberId, now).first()) as { followers: number } | null;

  const events = detectMilestones(prev?.followers, followers, thresholdsForGoal(goal), now);
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
