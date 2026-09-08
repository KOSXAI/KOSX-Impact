import { Hono } from "hono";
import type { DashboardStats } from "./stats";
import { applyFollowerStats, collect, drainRefreshQueue, processOldestPending } from "./collector";
import { CACHE_KEYS, cachedResponse, readCacheBust } from "./cache";
import { renderMemberCard, renderNotFoundCard, renderSiteOgCard } from "./card";
import { renderMemberOgPng, renderSiteOgPng, renderReportOgPng, renderTrackOgPng, renderLeaderboardOgPng, ogNotFound } from "./og-render";
import { computeMemberStats, computeDashboardStats } from "./stats";
import { getDashboardStats, getMemberDetail, getTopPosts } from "./queries";
import { roster } from "./roster";
import { enqueueRefresh, lookupRefreshMember, normalizeHandle, registerMember, tryGrabRefreshSlot } from "./refresh-queue";
import { getSource } from "./sources";
import { SocialDataError } from "./sources/socialdata";
import { TRACKS } from "./tracks";
import { titleOf } from "./milestones";
import { badge } from "./lib/format";
import { SITE_URL } from "./lib/site";

export const api = new Hono<{ Bindings: Env }>();

// 健康检查：供 CI 与监控探活使用
api.get("/api/health", (c) => c.json({ ok: true, now: new Date().toISOString() }));

// 看板统计：社群总量 + 总排行 + 登阶记录（API 与首页 SSR 共用 queries.ts 的缓存）
api.get("/api/dashboard", async (c) => {
  const stats = await getDashboardStats(c.env);
  return c.json(stats);
});

// 精华帖：近 30 天单帖浏览 Top（独立页 /posts 与 API 共用缓存）
api.get("/api/top-posts", async (c) => {
  const posts = await getTopPosts(c.env);
  return c.json({ posts, updatedAt: new Date().toISOString() });
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
// 自助注册（register:true）且抢到槽时当场拉一次 SocialData——存在即校验、数据即入库：
// 账号不存在（404）直接拒绝，脏 handle 进不了名单；数据源抖动等非确定性错误降级为
// 注册 + 入队，由兜底通道补采（宁可稍慢，不让一次网络抖动挡掉正常加入）。
api.post("/api/refresh", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { input?: string; register?: boolean }
    | null;
  const handle = normalizeHandle(body?.input ?? "");
  if (!handle) return c.json({ error: "invalid_handle" }, 400);

  const nowIso = new Date().toISOString();
  let member = await lookupRefreshMember(c.env, handle);
  const isNewRegistration = !member;
  if (isNewRegistration && !body?.register) return c.json({ error: "not_member" }, 404);

  const source = getSource(c.env);

  if (isNewRegistration && (await tryGrabRefreshSlot(c.env, nowIso))) {
    try {
      const stats = await source.fetchStats(handle);
      await registerMember(c.env, handle, nowIso);
      member = await lookupRefreshMember(c.env, handle);
      if (!member) return c.json({ error: "register_failed" }, 500);
      await applyFollowerStats(c.env, member.id, stats, nowIso, source);
      return c.json({ status: "done", followersAfter: stats.followers, memberId: member.id });
    } catch (error) {
      if (error instanceof SocialDataError && error.status === 404) {
        // 账号确实不存在：拒绝注册，不建任何行（脏 handle 进不了名单）
        return c.json(
          { error: "account_not_found", message: "在 X 上查无此账号，请检查 @ID 是否拼写正确。" },
          422
        );
      }
      // 其他错误（限流/网络等）：落到下方照常注册 + 入队，由兜底通道补采
    }
  }

  if (!member) {
    await registerMember(c.env, handle, nowIso);
    member = await lookupRefreshMember(c.env, handle);
    if (!member) return c.json({ error: "register_failed" }, 500);
  }

  const enqueued = await enqueueRefresh(c.env, member.id, nowIso);
  if (enqueued === "already_pending" || enqueued === "throttled") {
    // memberId 必须带：前端排队态「查看成长档案」依赖它跳转（缺失会点不动）
    return c.json({
      status: enqueued === "already_pending" ? "queued" : "throttled",
      memberId: member.id,
    });
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

/** llms.txt：给 AI 爬虫的全站结构索引（LLM 友好的站点说明） */
function renderLlmsTxt(): Response {
  const text = `# KOSX 影响力平台（impact.kosx.ai）

> KOSX 万粉影响力计划：追踪并展示 KOSX 成员在 X 平台上的成长数据——粉丝量、增长速度、
> 称号大关、社群总影响力，把成员的影响力汇聚成一张属于 KOSX 的影响力网络。
> 站点语言为简体中文。数据来自成员账号的公开信息，每天更新一次；数据口径见「关于」页。

## 页面

- [首页](https://impact.kosx.ai/)：社群规模、今日动态（登阶 / 涨粉先锋 / 今日曝光增量）、
  社群全景（称号分布 / 总量趋势 / 社群互推）、赛道速览、内容热点、品牌声量与情绪分布。
- [榜单](https://impact.kosx.ai/leaderboard)：总排行 / 成长榜 / 新锐潜力 / 影响力 / 被提及 / 勤快 / 登阶记录，
  每个榜可带时间档参数（?tab=growth&range=7）。
- [成员广场](https://impact.kosx.ai/members)：按赛道 / 标签 / 粉丝量筛选全部成员，复制 @ 清单批量关注。
- [赛道](https://impact.kosx.ai/tracks)：AI工具 / 财经 / 开发者 / 增长 / 出海 五个赛道 + 综合兜底，
  每个赛道独立页（seo 收录 + 批量关注 + 分享）。
- [内容](https://impact.kosx.ai/posts)：近 30 天精华帖与全站历史 Top 帖、内容洞察（爆款 / 标签云 / 停更）。
- [社群日报](https://impact.kosx.ai/daily)：每日战报——今日登阶 / 涨粉冠军 / 赛道表现 / 最爆内容 / 品牌声量。
- [关于](https://impact.kosx.ai/about)：数据口径、称号段位、影响力指数公式。
- [RSS 更新源](https://impact.kosx.ai/feed.xml)：登阶与爆款内容更新。

## 成员档案页

每位成员有独立档案页 https://impact.kosx.ai/members/{id}：粉丝曲线、赛道名次、
称号之路、影响力指数、粉丝画像（样本）、相似账号与同赛道伙伴、内容密码（黄金时段 / 爆款涨粉归因）。

## 数据口径

- 数据来自 X 公开信息，每天更新一次（快照随整点滚动采集，被提及每日 09:30 同步，粉丝画像月度刷新）。
- 「今日曝光增量」= 帖子近 24h 刷新后的浏览增量合计；「帖均曝光」= 近 30 天总浏览 / 发帖数。
- 粉丝样本重叠为采样方向性参考，非精确重叠。
`;
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function renderSitemap(): Response {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${SITE_URL}/leaderboard`, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/members`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/tracks`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/posts`, changefreq: "daily", priority: "0.7" },
    { loc: `${SITE_URL}/daily`, changefreq: "daily", priority: "0.7" },
    { loc: `${SITE_URL}/report`, changefreq: "weekly", priority: "0.6" },
    { loc: `${SITE_URL}/about`, changefreq: "monthly", priority: "0.3" },
    // 赛道页（5 正式赛道；综合过渡桶不出独立页）
    ...TRACKS.map((t) => ({ loc: `${SITE_URL}/tracks/${t.slug}`, changefreq: "daily", priority: "0.8" })),
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

/** RSS 源：登阶事件 + 爆款内容（订阅/更新提醒的零基础设施落法，供 RSS 阅读器抓取） */
async function renderFeed(env: Env): Promise<Response> {
  const stats = await getDashboardStats(env);
  const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];
  for (const m of stats.recentMilestones) {
    items.push({
      title: `${m.displayName ?? m.handle} 拿下称号「${titleOf(m.threshold)}」`,
      link: `${SITE_URL}/members/${m.memberId}`,
      pubDate: new Date(m.achievedAt).toUTCString(),
      description: `KOSX 万粉影响力计划：${m.displayName ?? m.handle} 跨过 ${badge(m.threshold)} 粉大关。`,
    });
  }
  for (const p of (stats.topPosts ?? []).slice(0, 10)) {
    items.push({
      title: `${p.member?.displayName ?? p.member?.handle ?? "成员"} 的爆款帖 · ${p.views != null ? badge(p.views) : ""} 浏览`,
      link: p.url,
      pubDate: new Date(p.createdAt).toUTCString(),
      description: (p.text ?? "").slice(0, 160),
    });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>KOSX 万粉影响力计划 · 更新</title><link>${SITE_URL}/</link>
<description>登阶记录与爆款内容</description>
${items
  .map(
    (i) => `<item><title>${escapeXml(i.title)}</title><link>${i.link}</link><pubDate>${i.pubDate}</pubDate><description>${escapeXml(i.description)}</description></item>`
  )
  .join("\n")}
</channel></rss>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 非 React SSR 请求的统一分发：API / SVG 卡 / OG 图 / SEO 文件；未命中返回 null 交给 SSR */
export async function handleWorkerRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname.startsWith("/api/")) return honoApp.fetch(request, env);
  if (pathname === "/og.svg") return renderOgSvg(env);
  // OG 分享卡（PNG）：X/微信等平台不渲染 SVG 的 og:image，分享预览走这里
  if (pathname === "/og/site.png") return renderSiteOgPng(env, url.origin);
  if (pathname === "/og/leaderboard.png") return renderLeaderboardOgPng(env, url.origin);
  if (pathname.startsWith("/og/members/")) {
    const id = pathname.slice("/og/members/".length).replace(/\.png$/, "").split("/")[0];
    return id ? renderMemberOgPng(env, id, url.origin) : ogNotFound();
  }
  if (pathname.startsWith("/og/reports/")) {
    const id = pathname.slice("/og/reports/".length).replace(/\.png$/, "").split("/")[0];
    return id ? renderReportOgPng(env, id, url.origin) : ogNotFound();
  }
  if (pathname.startsWith("/og/tracks/")) {
    const slug = pathname.slice("/og/tracks/".length).replace(/\.png$/, "").split("/")[0];
    return slug ? renderTrackOgPng(env, slug, url.origin) : ogNotFound();
  }
  if (pathname === "/robots.txt") return renderRobots();
  if (pathname === "/sitemap.xml") return renderSitemap();
  if (pathname === "/llms.txt") return renderLlmsTxt();
  if (pathname === "/feed.xml") return renderFeed(env);
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