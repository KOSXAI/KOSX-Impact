/**
 * 共享查询层：Hono API 路由与 TanStack Start SSR（server functions）都从这里取数。
 * 复用同一批 Cache API 缓存键（按绝对 URL），SSR 与 API 端点共享边缘缓存，
 * 不因前端迁移增加 D1 行读取；cron 采集后 purgeReadCaches 对两者同时生效。
 */
import type { DashboardStats, MemberDetail } from "./stats";
import { computeDashboardStats, computeMemberStats } from "./stats";
import { roster } from "./roster";
import { cachedResponse } from "./cache";

// Env 由 worker-configuration.d.ts / env.d.ts 全局声明（无单独模块）

const SITE_URL = "https://10k.kosx.ai";

const MEMBER_FIELDS = `id, handle, display_name AS displayName, goal, joined_at AS joinedAt, profile_image AS profileImage`;
const SNAPSHOT_FIELDS = `member_id AS memberId, followers, recorded_at AS recordedAt`;

type MemberRow = {
  id: string;
  handle: string;
  displayName: string | null;
  goal: number;
  joinedAt: string;
  profileImage: string | null;
};
type SnapshotRow = { memberId: string; followers: number; recordedAt: string };

/** 看板统计（/api/dashboard 与首页 SSR 共用，缓存键 https://10k.kosx.ai/api/dashboard） */
export async function getDashboardStats(env: Env): Promise<DashboardStats> {
  const res = await cachedResponse(new Request(`${SITE_URL}/api/dashboard?v=6`), 3600, async () => {
    const now = new Date().toISOString();
    const { results: memberRows } = await env.DB.prepare(
      `SELECT ${MEMBER_FIELDS} FROM members WHERE status = 'active' ORDER BY joined_at`
    ).all();
    const memberList = memberRows as never as MemberRow[];
    // 每成员最近 31 条快照（窗口查询，走 idx_snapshots_member_date，行读取恒定）
    const snapshotStmt = env.DB.prepare(
      "SELECT member_id AS memberId, followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ?1 ORDER BY recorded_at DESC LIMIT 31"
    );
    const snapshotBatches = await env.DB.batch(memberList.map((m) => snapshotStmt.bind(m.id)));

    const { results: milestoneRows } = await env.DB.prepare(
      `SELECT ms.member_id AS memberId, m.handle, m.display_name AS displayName, ms.threshold, ms.achieved_at AS achievedAt
       FROM milestones ms
       JOIN members m ON m.id = ms.member_id
       WHERE m.status = 'active'`
    ).all();

    const memberStats = memberList.map((m, i) => {
      const rows = (snapshotBatches[i]?.results ?? []) as never as SnapshotRow[];
      // 窗口内是倒序取的，统计层期望正序
      const snapshots = rows.slice().reverse();
      return { ...m, snapshots };
    });

    // 与 API JSON 响应同构：computeDashboardStats 输出即 DashboardStats
    const stats = computeDashboardStats(roster, memberStats, milestoneRows as never, now);
    return new Response(JSON.stringify(stats), {
      headers: { "Content-Type": "application/json" },
    });
  });
  return (await res.json()) as DashboardStats;
}

/** 成员详情（/api/members/:id 与成员页 SSR 共用，缓存键 https://10k.kosx.ai/api/members/:id） */
export async function getMemberDetail(env: Env, id: string): Promise<MemberDetail | null> {
  const res = await cachedResponse(new Request(`${SITE_URL}/api/members/${id}?v=6`), 3600, async () => {
    const member = await env.DB.prepare(
      `SELECT ${MEMBER_FIELDS} FROM members WHERE id = ? AND status = 'active'`
    ).bind(id).first();
    if (!member) return new Response(JSON.stringify({ error: "member not found" }), { status: 404 });

    const { results: snapshots } = await env.DB.prepare(
      "SELECT followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ? ORDER BY recorded_at"
    ).bind(id).all();
    const { results: milestones } = await env.DB.prepare(
      "SELECT threshold, achieved_at AS achievedAt FROM milestones WHERE member_id = ? ORDER BY threshold"
    ).bind(id).all();

    const stats = computeMemberStats(
      member as never as {
        id: string;
        handle: string;
        displayName: string | null;
        goal: number;
        joinedAt: string;
        profileImage: string | null;
      },
      snapshots as never,
      new Date().toISOString()
    );
    const detail = { member: stats, snapshots: snapshots as never, milestones: milestones as never };
    return new Response(JSON.stringify(detail), { headers: { "Content-Type": "application/json" } });
  });
  if (res.status === 404) return null;
  return (await res.json()) as MemberDetail;
}