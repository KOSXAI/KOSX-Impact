import { Hono } from "hono";
import { collect } from "./collector";
import { cachedResponse } from "./cache";
import { renderMemberCard, renderNotFoundCard, renderSiteOgCard } from "./card";
import { renderAboutPage, renderDashboard, renderMemberPage } from "./dashboard";
import { computeDashboardStats, computeMemberStats } from "./stats";
import { roster } from "./roster";

const app = new Hono<{ Bindings: Env }>();

// 健康检查：供 CI 与监控探活使用
app.get("/api/health", (c) => c.json({ ok: true, now: new Date().toISOString() }));

// 看板统计：社群总量 + 增长榜 + 最近里程碑
// 优先读 daily_stats 预聚合（单查询，行读取 O(成员)）；缺数据的成员回退窗口查询
app.get("/api/dashboard", async (c) => {
  return cachedResponse(c.req.raw, 3600, async () => {
    const now = new Date().toISOString();
    const { results: memberRows } = await c.env.DB.prepare(
      `SELECT id, handle, display_name AS displayName, goal, joined_at AS joinedAt
       FROM members WHERE status = 'active' ORDER BY joined_at`
    ).all();
    const memberList = memberRows as never as Array<{ id: string; handle: string; displayName: string | null; goal: number; joinedAt: string }>;

    // 预聚合：每成员 daily_stats 最新一条（走 idx_daily_stats_date + 主键）
    const { results: statsRows } = await c.env.DB.prepare(
      `SELECT ds.member_id AS memberId, ds.followers, ds.growth, ds.growth7d, ds.growth30d,
              ds.progress, ds.streak_days AS streakDays, ds.achieved, ds.overflow, ds.stats_date
       FROM daily_stats ds
       WHERE ds.stats_date = (SELECT MAX(stats_date) FROM daily_stats WHERE member_id = ds.member_id)`
    ).all();
    const statsByMember = new Map(
      (statsRows as never as Array<{
        memberId: string; followers: number; growth: number; growth7d: number; growth30d: number;
        progress: number; streakDays: number; achieved: number; overflow: number; stats_date: string;
      }>).map((r) => [r.memberId, r])
    );

    // 无预聚合数据的成员回退窗口查询（新加入、尚未被滚动采集轮到）
    const missing = memberList.filter((m) => !statsByMember.has(m.id));
    const fallbackStats = new Map<string, { followers: number; recordedAt: string }[]>();
    if (missing.length > 0) {
      const windowStmt = c.env.DB.prepare(
        "SELECT member_id AS memberId, followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ?1 ORDER BY recorded_at DESC LIMIT 31"
      );
      const batches = await c.env.DB.batch(missing.map((m) => windowStmt.bind(m.id)));
      missing.forEach((m, i) => {
        const rows = (batches[i]?.results ?? []) as never as Array<{ followers: number; recordedAt: string }>;
        fallbackStats.set(m.id, rows.slice().reverse());
      });
    }

    const { results: milestoneRows } = await c.env.DB.prepare(
      `SELECT ms.member_id AS memberId, m.handle, m.display_name AS displayName, ms.threshold, ms.achieved_at AS achievedAt
       FROM milestones ms
       JOIN members m ON m.id = ms.member_id
       WHERE m.status = 'active'`
    ).all();

    const stats = computeDashboardStats(
      roster,
      memberList.map((m) => {
        const pre = statsByMember.get(m.id);
        if (pre) {
          return {
            id: m.id,
            handle: m.handle,
            displayName: m.displayName,
            goal: m.goal,
            joinedAt: m.joinedAt,
            snapshots: [{
              followers: pre.followers,
              recordedAt: `${pre.stats_date}T00:00:00Z`,
            }],
            // 预聚合字段直传，绕过窗口重算
            preset: {
              growth: pre.growth,
              growth7d: pre.growth7d,
              growth30d: pre.growth30d,
              progress: pre.progress,
              streakDays: pre.streakDays,
              achieved: pre.achieved === 1,
              overflow: pre.overflow,
            },
          };
        }
        return {
          id: m.id,
          handle: m.handle,
          displayName: m.displayName,
          goal: m.goal,
          joinedAt: m.joinedAt,
          snapshots: fallbackStats.get(m.id) ?? [],
        };
      }),
      milestoneRows as never,
      now
    );
    return c.json(stats);
  });
});

// 成员列表，附带每人最新一次快照的粉丝量
app.get("/api/members", async (c) => {
  return cachedResponse(c.req.raw, 3600, async () => {
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
});

// 单个成员的成长曲线与里程碑
app.get("/api/members/:id", async (c) => {
  return cachedResponse(c.req.raw, 3600, async () => {
    const id = c.req.param("id") ?? "";
    const member = await c.env.DB.prepare("SELECT id, handle, display_name, platform, status, goal, joined_at FROM members WHERE id = ?").bind(id).first();
    if (!member) return c.json({ error: "member not found" }, 404);

    const { results: snapshots } = await c.env.DB.prepare(
      "SELECT followers, following, posts, recorded_at FROM snapshots WHERE member_id = ? ORDER BY recorded_at"
    ).bind(id).all();
    const { results: milestones } = await c.env.DB.prepare(
      "SELECT threshold, achieved_at FROM milestones WHERE member_id = ? ORDER BY threshold"
    ).bind(id).all();

    return c.json({ member, snapshots, milestones });
  });
});

// 成员详情页：成长曲线 + 里程碑
app.get("/members/:id", async (c) => {
  return cachedResponse(c.req.raw, 3600, async () => {
    const id = c.req.param("id") ?? "";
    const member = await c.env.DB.prepare("SELECT id, handle, display_name, goal, joined_at FROM members WHERE id = ? AND status = 'active'").bind(id).first();
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
});

// 成员进度卡片：可嵌入 GitHub README / 个人主页（<img src="https://10k.kosx.ai/card/{id}.svg">）
// 注：路由用 :id 而非 :id.svg——Hono 不支持参数名里带点，.svg 后缀在 handler 内剔除
app.get("/card/:id", async (c) => {
  const id = (c.req.param("id") ?? "").replace(/\.svg$/, "");
  if (!id) return c.body(renderNotFoundCard("unknown"), 404, { "Content-Type": "image/svg+xml" });
  // 卡片是嵌入在成员个人主页里的高频图，边缘缓存挡掉绝大部分回源
  return cachedResponse(c.req.raw, 3600, async () => {
    const member = await c.env.DB.prepare("SELECT id, handle, display_name, goal, joined_at FROM members WHERE id = ? AND status = 'active'").bind(id).first();
    if (!member) {
      return c.body(renderNotFoundCard(id), 404, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" });
    }
    // 优先读预聚合（单行点查），缺数据回退窗口查询
    const pre = await c.env.DB.prepare(
      `SELECT followers, growth, growth7d, growth30d, progress, streak_days AS streakDays, achieved, overflow, stats_date
       FROM daily_stats WHERE member_id = ?1 ORDER BY stats_date DESC LIMIT 1`
    ).bind(id).first() as never as {
      followers: number; growth: number; growth7d: number; growth30d: number;
      progress: number; streakDays: number; achieved: number; overflow: number; stats_date: string;
    } | null;

    let stats;
    if (pre) {
      stats = computeMemberStats(
        {
          id: member.id,
          handle: member.handle,
          displayName: member.display_name,
          goal: member.goal,
          joinedAt: member.joined_at,
        } as { id: string; handle: string; displayName: string | null; goal: number; joinedAt: string },
        [{ followers: pre.followers, recordedAt: `${pre.stats_date}T00:00:00Z` }],
        new Date().toISOString()
      );
      stats = {
        ...stats,
        growth: pre.growth,
        growth7d: pre.growth7d,
        growth30d: pre.growth30d,
        progress: pre.progress,
        streakDays: pre.streakDays,
        achieved: pre.achieved === 1,
        overflow: pre.overflow,
      };
    } else {
      const { results: snapshots } = await c.env.DB.prepare(
        "SELECT followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ? ORDER BY recorded_at"
      ).bind(id).all();
      stats = computeMemberStats(
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
    }
    return c.body(renderMemberCard(stats), 200, {
      "Content-Type": "image/svg+xml",
    });
  });
});

// 站点 OG 图：分享到社媒时的动态预览（社群总量）
// 读 daily_stats 预聚合（单查询），缓存 6 小时挡爬虫高频预览
app.get("/og.svg", async (c) => {
  return cachedResponse(c.req.raw, 21600, async () => {
    const agg = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(ds.followers), 0) AS totalFollowers, COUNT(DISTINCT ds.member_id) AS memberCount
       FROM daily_stats ds
       WHERE ds.stats_date = (SELECT MAX(stats_date) FROM daily_stats)`
    ).first<{ totalFollowers: number; memberCount: number }>();

    // 无预聚合数据时（首次部署）回退统计 active 成员数
    let totalFollowers = agg?.totalFollowers ?? 0;
    let memberCount = agg?.memberCount ?? 0;
    if (memberCount === 0) {
      const row = await c.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM members WHERE status = 'active'"
      ).first<{ n: number }>();
      memberCount = row?.n ?? 0;
    }
    return c.body(renderSiteOgCard(totalFollowers, memberCount), 200, {
      "Content-Type": "image/svg+xml",
    });
  });
});

// 关于页：数据口径 / 来源 / 退出方式（README 承诺的透明度页面）
app.get("/about", (c) => c.html(renderAboutPage()));

// 看板页面：预渲染的 HTML 骨架，可视化前端在后续迭代中完善
app.get("/", (c) => c.html(renderDashboard()));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      collect(env, ctx).then((summary) =>
        console.log(`[collect] 完成：成功 ${summary.ok}，失败 ${summary.failed.length}`)
      )
    );
  },
} satisfies ExportedHandler<Env>;
