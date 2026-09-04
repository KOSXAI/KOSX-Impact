import { Hono } from "hono";
import { collect } from "./collector";
import { renderDashboard, renderMemberPage } from "./dashboard";
import { computeDashboardStats, computeMemberStats } from "./stats";
import { roster } from "./roster";

const app = new Hono<{ Bindings: Env }>();

// 健康检查：供 CI 与监控探活使用
app.get("/api/health", (c) => c.json({ ok: true, now: new Date().toISOString() }));

// 看板统计：社群总量 + 增长榜 + 最近里程碑（一次请求渲染整页）
app.get("/api/dashboard", async (c) => {
  const now = new Date().toISOString();
  const { results: memberRows } = await c.env.DB.prepare(
    `SELECT id, handle, display_name AS displayName, goal, joined_at AS joinedAt
     FROM members WHERE status = 'active' ORDER BY joined_at`
  ).all();
  const { results: snapshotRows } = await c.env.DB.prepare(
    "SELECT member_id AS memberId, followers, recorded_at AS recordedAt FROM snapshots ORDER BY recorded_at"
  ).all();
  const { results: milestoneRows } = await c.env.DB.prepare(
    `SELECT ms.member_id AS memberId, m.handle, m.display_name AS displayName, ms.threshold, ms.achieved_at AS achievedAt
     FROM milestones ms
     JOIN members m ON m.id = ms.member_id
     WHERE m.status = 'active'`
  ).all();

  // 快照按成员分组，交给统计层计算基线增长 / 连胜 / 近期趋势
  const byMember = new Map<string, Array<{ followers: number; recordedAt: string }>>();
  for (const s of snapshotRows as never as Array<{ memberId: string; followers: number; recordedAt: string }>) {
    const list = byMember.get(s.memberId) ?? [];
    list.push({ followers: s.followers, recordedAt: s.recordedAt });
    byMember.set(s.memberId, list);
  }

  const stats = computeDashboardStats(
    roster,
    (memberRows as never as Array<{ id: string; handle: string; displayName: string | null; goal: number; joinedAt: string }>)
      .map((m) => ({
        id: m.id,
        handle: m.handle,
        displayName: m.displayName,
        goal: m.goal,
        joinedAt: m.joinedAt,
        snapshots: byMember.get(m.id) ?? [],
      })),
    milestoneRows as never,
    now
  );
  return c.json(stats);
});

// 成员列表，附带每人最新一次快照的粉丝量
app.get("/api/members", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT
       m.id, m.handle, m.display_name, m.goal, m.joined_at,
       s.followers  AS latest_followers,
       s.recorded_at AS latest_recorded_at
     FROM members m
     LEFT JOIN snapshots s ON s.id = (
       SELECT id FROM snapshots WHERE member_id = m.id ORDER BY recorded_at DESC LIMIT 1
     )
     WHERE m.status = 'active'
     ORDER BY m.joined_at`
  ).all();
  return c.json({ members: results });
});

// 单个成员的成长曲线与里程碑
app.get("/api/members/:id", async (c) => {
  const id = c.req.param("id");
  const member = await c.env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  if (!member) return c.json({ error: "member not found" }, 404);

  const { results: snapshots } = await c.env.DB.prepare(
    "SELECT followers, following, posts, recorded_at FROM snapshots WHERE member_id = ? ORDER BY recorded_at"
  ).bind(id).all();
  const { results: milestones } = await c.env.DB.prepare(
    "SELECT threshold, achieved_at FROM milestones WHERE member_id = ? ORDER BY threshold"
  ).bind(id).all();

  return c.json({ member, snapshots, milestones });
});

// 成员详情页：成长曲线 + 里程碑
app.get("/members/:id", async (c) => {
  const id = c.req.param("id");
  const member = await c.env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  if (!member) return c.html(renderMemberPage(id, "成员不存在"), 404);

  const { results: snapshots } = await c.env.DB.prepare(
    "SELECT followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ? ORDER BY recorded_at"
  ).bind(id).all();
  const { results: milestones } = await c.env.DB.prepare(
    "SELECT threshold, achieved_at AS achievedAt FROM milestones WHERE member_id = ? ORDER BY threshold"
  ).bind(id).all();

  const stats = computeMemberStats(
    {
      id: member.id,
      handle: member.handle,
      displayName: member.display_name,
      goal: member.goal,
      joinedAt: member.joined_at,
    } as { id: string; handle: string; displayName: string | null; goal: number; joinedAt: string },
    snapshots as never,
    new Date().toISOString()
  );
  return c.html(
    renderMemberPage(id, null, {
      member: stats,
      snapshots: snapshots as never,
      milestones: milestones as never,
    })
  );
});

// 看板页面：预渲染的 HTML 骨架，可视化前端在后续迭代中完善
app.get("/", (c) => c.html(renderDashboard()));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      collect(env).then((summary) =>
        console.log(`[collect] 完成：成功 ${summary.ok}，失败 ${summary.failed.length}`)
      )
    );
  },
} satisfies ExportedHandler<Env>;
