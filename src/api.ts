import { Hono } from "hono";
import type { DashboardStats } from "./stats";
import { collect, drainRefreshQueue, processOldestPending } from "./collector";
import { CACHE_KEYS, cachedResponse, readCacheBust } from "./cache";
import { renderMemberCard, renderNotFoundCard, renderSiteOgCard } from "./card";
import { computeMemberStats, computeDashboardStats } from "./stats";
import { getDashboardStats, getMemberDetail } from "./queries";
import { roster } from "./roster";
import { enqueueRefresh, lookupRefreshMember, normalizeHandle, registerMember, tryGrabRefreshSlot } from "./refresh-queue";
import { getSource } from "./sources";
import { SITE_URL } from "./lib/site";

export const api = new Hono<{ Bindings: Env }>();

// 健康检查：供 CI 与监控探活使用
api.get("/api/health", (c) => c.json({ ok: true, now: new Date().toISOString() }));

// 看板统计：社群总量 + 总排行 + 登阶记录（API 与首页 SSR 共用 queries.ts 的缓存）
api.get("/api/dashboard", async (c) => {
  const stats = await getDashboardStats(c.env);
  return c.json(stats);
});

// 成员列表，附带每人最新一次快照的粉丝量
api.get("/api/members", async (c) => {
  const bust = await readCacheBust(c.env);
  return cachedResponse(new Request(`${SITE_URL}${CACHE_KEYS.memberList}&cb=${bust}`), 3600, async () => {
    const { results } = await c.env.DB.prepare(
      `SELECT
         m.id, m.handle, m.display_name, m.joined_at,
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

// 单个成员的成长曲线与登阶记录（API 与成员页 SSR 共用 queries.ts 的缓存）
api.get("/api/members/:id", async (c) => {
  const detail = await getMemberDetail(c.env, c.req.param("id") ?? "");
  if (!detail) return c.json({ error: "member not found" }, 404);
  return c.json(detail);
});

// ============ 成员自助更新 ============
// 查询预览：读本地库展示成员当前看板数据（不触发采集、不耗 SocialData 额度）
api.get("/api/refresh/lookup", async (c) => {
  const handle = normalizeHandle(c.req.query("handle") ?? "");
  if (!handle) return c.json({ error: "invalid_handle" }, 400);
  const preview = await lookupRefreshMember(c.env, handle);
  if (!preview) return c.json({ error: "not_member" }, 404);
  return c.json(preview);
});

// 提交更新 / 自助加入：入队（去重 + 防抖）→ 抢到全局节流槽则当场处理最旧一条 pending
// （即时通道，队列空时即本条）；抢不到留在队列由 cron 兜底清空。
// 未在册的 handle 带显式 register 意图时直接加入追踪（无审批流）。
api.post("/api/refresh", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { input?: string; register?: boolean }
    | null;
  const handle = normalizeHandle(body?.input ?? "");
  if (!handle) return c.json({ error: "invalid_handle" }, 400);

  const nowIso = new Date().toISOString();
  let member = await lookupRefreshMember(c.env, handle);
  if (!member) {
    if (!body?.register) return c.json({ error: "not_member" }, 404);
    await registerMember(c.env, handle, nowIso);
    member = await lookupRefreshMember(c.env, handle);
    if (!member) return c.json({ error: "register_failed" }, 500);
  }

  const enqueued = await enqueueRefresh(c.env, member.id, nowIso);
  if (enqueued === "already_pending" || enqueued === "throttled") {
    return c.json({ status: enqueued === "already_pending" ? "queued" : "throttled" });
  }

  // 抢到节流槽才即时采集：CAS 保证并发下同一时刻只有一条请求真正拉 SocialData，
  // 其余自动留在队列（成员页展示的 pending 状态会说明正在排队）
  if (await tryGrabRefreshSlot(c.env, nowIso)) {
    await processOldestPending(c.env, getSource(c.env));
  }

  const job = (await c.env.DB.prepare(
    "SELECT status, followers_after AS followersAfter FROM refresh_queue WHERE member_id = ?1 ORDER BY id DESC LIMIT 1"
  ).bind(member.id).first()) as { status: string; followersAfter: number | null } | null;

  // 写库时 cache_bust 已 +1：读端点缓存键自动换新，新请求回源即见新数据，
  // 无需手动清缓存（跨数据中心 purge 本就只能清触发方所在区域）
  return c.json({
    status: job?.status === "done" ? "done" : "queued",
    followersAfter: job?.followersAfter ?? null,
    memberId: member.id,
  });
});

// 成员进度卡片：可嵌入 GitHub README / 个人主页（<img src="https://impact.kosx.ai/card/{id}.svg">）
// 注：路由用 :id 而非 :id.svg——Hono 不支持参数名里带点，.svg 后缀在 handler 内剔除
// 卡片是嵌入在成员个人主页里的高频图，边缘缓存挡掉绝大部分回源
// 高频图：浏览器也按 ttl 长缓存（browserTtl），不做 60 秒短缓存
export async function renderMemberCardSvg(id: string, env: Env): Promise<Response> {
  return cachedResponse(new Request(`${SITE_URL}/card/${id}`), 3600, async () => {
    const member = await env.DB.prepare("SELECT * FROM members WHERE id = ? AND status = 'active'").bind(id).first();
    if (!member) {
      return new Response(renderNotFoundCard(id), {
        status: 404,
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
      });
    }
    const { results: snapshots } = await env.DB.prepare(
      "SELECT followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ? ORDER BY recorded_at"
    ).bind(id).all();
    // SELECT * 返回 snake_case 列名，computeMemberStats 需要 camelCase 字段
    const m = member as Record<string, unknown>;
    const stats = computeMemberStats(
      {
        id: m.id as string,
        handle: m.handle as string,
        displayName: (m.display_name as string | null) ?? null,
        joinedAt: m.joined_at as string,
      },
      snapshots as never,
      new Date().toISOString(),
      m.baseline_followers as number | null
    );
    return new Response(renderMemberCard(stats), {
      headers: { "Content-Type": "image/svg+xml" },
    });
  }, { browserTtl: 3600 });
}

// 站点 OG 图：分享到社媒时的动态预览（社群总量）
// 只需每成员最新一条快照（窗口 LIMIT 1），缓存 6 小时挡爬虫高频预览
// 高频图：浏览器也按 ttl 长缓存（browserTtl）
export async function renderOgSvg(env: Env): Promise<Response> {
  return cachedResponse(new Request(`${SITE_URL}${CACHE_KEYS.og}`), 21600, async () => {
    const now = new Date().toISOString();
    const { results: memberRows } = await env.DB.prepare(
      `SELECT id, handle, display_name AS displayName, joined_at AS joinedAt
       FROM members WHERE status = 'active'`
    ).all();
    const memberList = memberRows as never as Array<{ id: string; handle: string; displayName: string | null; joinedAt: string }>;

    // 每成员最新 1 条快照（走索引，恒定行读取）
    const latestStmt = env.DB.prepare(
      "SELECT member_id AS memberId, followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ?1 ORDER BY recorded_at DESC LIMIT 1"
    );
    const snapshotBatches = await env.DB.batch(memberList.map((m) => latestStmt.bind(m.id)));

    const stats: DashboardStats = computeDashboardStats(
      roster,
      memberList.map((m, i) => {
        const rows = (snapshotBatches[i]?.results ?? []) as never as Array<{ followers: number; recordedAt: string }>;
        return { ...m, snapshots: rows };
      }),
      [],
      now
    );
    return new Response(renderSiteOgCard(stats.totalFollowers, stats.members.length), {
      headers: { "Content-Type": "image/svg+xml" },
    });
  }, { browserTtl: 21600 });
}

export const honoApp = new Hono<{ Bindings: Env }>().route("/", api);

// robots.txt / sitemap.xml：SEO 基础设施，由 server.ts 显式分发
function renderRobots(): Response {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}

function renderSitemap(): Response {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${SITE_URL}/about`, changefreq: "monthly", priority: "0.3" },
    ...roster.members.map((m) => ({ loc: `${SITE_URL}/members/${m.id}`, changefreq: "daily", priority: "0.8" })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

/** 非 React SSR 请求的统一分发：API / SVG 卡 / OG 图 / SEO 文件；未命中返回 null 交给 SSR */
export async function handleWorkerRoutes(request: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/api/")) return honoApp.fetch(request, env);
  if (pathname === "/og.svg") return renderOgSvg(env);
  if (pathname === "/robots.txt") return renderRobots();
  if (pathname === "/sitemap.xml") return renderSitemap();
  if (pathname.startsWith("/card/")) {
    const id = pathname.slice("/card/".length).replace(/\.svg$/, "").split("/")[0];
    if (!id) return new Response(renderNotFoundCard("unknown"), { status: 404, headers: { "Content-Type": "image/svg+xml" } });
    return renderMemberCardSvg(id, env);
  }
  return null;
}

/**
 * Cron 分发（wrangler.jsonc triggers.crons）：
 * - `0 * * * *`（整点）：滚动分片采集 + 自助队列兜底（collect）
 * - `5-59/10 * * * *`（错峰每 10 分钟）：只清自助更新队列——提交后数据最长 10 分钟落地，
 *   不必等下一个整点；错峰避开整点避免与采集撞车
 */
export async function runScheduled(env: Env, ctx: ExecutionContext, cron: string): Promise<void> {
  if (cron !== "0 * * * *") {
    ctx.waitUntil(
      drainRefreshQueue(env, getSource(env)).then((s) =>
        console.log(`[refresh-queue] 兜底清空：成功 ${s.ok}，失败 ${s.failed}`)
      )
    );
    return;
  }
  ctx.waitUntil(
    collect(env, ctx).then((summary) =>
      console.log(`[collect] 完成：成功 ${summary.ok}，失败 ${summary.failed.length}`)
    )
  );
}