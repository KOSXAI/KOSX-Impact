import { Hono } from "hono";
import { collect } from "./collector";
import { renderDashboard } from "./dashboard";

const app = new Hono<{ Bindings: Env }>();

// 健康检查：供 CI 与监控探活使用
app.get("/api/health", (c) => c.json({ ok: true, now: new Date().toISOString() }));

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

// 看板页面：预渲染的 HTML 骨架，可视化前端在后续迭代中完善
app.get("/", (c) => c.html(renderDashboard()));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(collect(env));
  },
} satisfies ExportedHandler<Env>;
