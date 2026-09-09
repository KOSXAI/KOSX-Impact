import { Hono } from "hono";
import type { DashboardStats } from "./stats";
import { applyFollowerStats, collect, drainRefreshQueue, processOldestPending } from "./collector";
import { CACHE_KEYS, cachedResponse, readCacheBust } from "./cache";
import { renderMemberCard, renderNotFoundCard, renderSiteOgCard } from "./card";
import { renderMemberOgPng, renderSiteOgPng, renderReportOgPng, renderTrackOgPng, renderLeaderboardOgPng, ogNotFound } from "./og-render";
import { computeMemberStats, computeDashboardStats } from "./stats";
import { getDashboardStats, getMemberDetail, getTopPosts } from "./queries";
import { syncMemberMentions, syncCommunitySignals } from "./sync-signals";
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

// 邀请裂变上报：新成员自助加入后，把分享链接里的 ?invite= 归因到邀请人（幂等，一人只计一次）
api.post("/api/invite", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { inviterId?: string; invitedMemberId?: string } | null;
  if (!body?.inviterId || !body?.invitedMemberId) return c.json({ error: "invalid" }, 400);
  const inviter = await c.env.DB.prepare("SELECT id FROM members WHERE id = ? AND status = 'active'").bind(body.inviterId).first();
  const invited = await c.env.DB.prepare("SELECT id FROM members WHERE id = ? AND status = 'active'").bind(body.invitedMemberId).first();
  if (!inviter || !invited) return c.json({ error: "unknown_member" }, 422);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO invite_events (inviter_id, invited_member_id, created_at) VALUES (?, ?, ?)"
  ).bind(body.inviterId, body.invitedMemberId, new Date().toISOString()).run();
  return c.json({ ok: true });
});

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
export async function renderMemberCardSvg(
  id: string,
  env: Env,
  variant: "default" | "countdown" | "track" = "default"
): Promise<Response> {
  return cachedResponse(new Request(`${SITE_URL}/card/${id}?v=${variant}`), 3600, async () => {
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
    // 赛道/标签：members 表 JSON 文本 → 数组（赛道变体展示）
    try {
      const rawTracks = (m.tracks as string | null) ?? null;
      if (rawTracks) stats.tracks = JSON.parse(rawTracks).filter((x: unknown) => typeof x === "string");
    } catch {
      /* 解析失败留空 */
    }
    let trackRanks: Array<{ track: string; rank: number; total: number }> | undefined;
    if (variant === "track" && stats.tracks.length > 0) {
      // 赛道内名次：全量成员 + 最新快照（低频卡片图，缓存 1h 可接受）
      const { results: allRows } = await env.DB.prepare(
        `SELECT m.id, m.tracks, (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id ORDER BY s.recorded_at DESC LIMIT 1) AS f
         FROM members m WHERE m.status = 'active'`
      ).all();
      const parsed = (allRows as never as Array<{ id: string; tracks: string | null; f: number | null }>).map((r) => ({
        id: r.id,
        f: r.f ?? 0,
        tracks: (() => { try { return r.tracks ? (JSON.parse(r.tracks) as string[]) : []; } catch { return []; } })(),
      }));
      trackRanks = stats.tracks.map((track) => {
        const inTrack = parsed.filter((x) => x.tracks.includes(track)).sort((a, b) => b.f - a.f);
        return { track, rank: inTrack.findIndex((x) => x.id === id) + 1, total: inTrack.length };
      });
    }
    return new Response(renderMemberCard(stats, { variant, trackRanks }), {
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
- [内容](https://impact.kosx.ai/posts)：近 30 天精华帖与全站历史 Top 帖、内容洞察（爆款 / 标签云 / 停更）、内容配方（黄金时段 / 形态）、社群品味。
- [社群日报](https://impact.kosx.ai/daily)：每日战报——今日登阶 / 涨粉冠军 / 赛道表现 / 最爆内容 / 品牌声量；支持 ?date=YYYY-MM-DD 归档回看。
- [成员周报](https://impact.kosx.ai/reports/{id})：单成员周报——本周增长、登阶进度、内容表现，支持分享。
- [年度报告](https://impact.kosx.ai/annual)：年度影响力报告——年初至今增长、月度趋势、年度登阶与最火内容。
- [成员对比](https://impact.kosx.ai/compare?a={idA}&b={idB})：两位成员的成长曲线 / 赛道 / 称号并列对比。
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

/** sitemap：成员页直接查库（含自助注册成员——只按打包名册生成会让 77+ 成员对搜索引擎不可见），
 *  lastmod 用各成员最新快照时间（恒为「今天」的 lastmod 会被 Google 判定不可信而忽略） */
async function renderSitemap(env: Env): Promise<Response> {
  const bust = await readCacheBust(env);
  return cachedResponse(new Request(`${SITE_URL}${CACHE_KEYS.sitemap}&cb=${bust}`), 3600, async () => {
    const { results: memberRows } = await env.DB.prepare(
      `SELECT id,
              (SELECT MAX(s.recorded_at) FROM snapshots s WHERE s.member_id = m.id) AS lastmod
       FROM members m WHERE m.status = 'active' ORDER BY joined_at`
    ).all();
    const members = memberRows as never as Array<{ id: string; lastmod: string | null }>;
    // 静态页与赛道页的最后变动时间 = 全站最新一次快照（数据一天一更，跟着数据走）
    const dataDay = members.reduce<string | null>((max, m) => (m.lastmod && (!max || m.lastmod > max) ? m.lastmod : max), null)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: `${SITE_URL}/`, lastmod: dataDay, changefreq: "daily", priority: "1.0" },
      { loc: `${SITE_URL}/leaderboard`, lastmod: dataDay, changefreq: "daily", priority: "0.9" },
      { loc: `${SITE_URL}/members`, lastmod: dataDay, changefreq: "daily", priority: "0.8" },
      { loc: `${SITE_URL}/tracks`, lastmod: dataDay, changefreq: "daily", priority: "0.8" },
      { loc: `${SITE_URL}/posts`, lastmod: dataDay, changefreq: "daily", priority: "0.7" },
      { loc: `${SITE_URL}/daily`, lastmod: dataDay, changefreq: "daily", priority: "0.7" },
      { loc: `${SITE_URL}/report`, lastmod: dataDay, changefreq: "weekly", priority: "0.6" },
      { loc: `${SITE_URL}/annual`, lastmod: dataDay, changefreq: "weekly", priority: "0.6" },
      { loc: `${SITE_URL}/about`, lastmod: dataDay, changefreq: "monthly", priority: "0.3" },
      // 赛道页（5 正式赛道；综合过渡桶不出独立页）
      ...TRACKS.map((t) => ({ loc: `${SITE_URL}/tracks/${t.slug}`, lastmod: dataDay, changefreq: "daily", priority: "0.8" })),
      ...members.map((m) => ({
        loc: `${SITE_URL}/members/${m.id}`,
        lastmod: m.lastmod?.slice(0, 10) ?? dataDay,
        changefreq: "daily",
        priority: "0.8",
      })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;
    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  });
}

/** RSS 源：登阶事件 + 爆款内容（订阅/更新提醒的零基础设施落法，供 RSS 阅读器抓取） */
async function renderFeed(env: Env): Promise<Response> {
  const stats = await getDashboardStats(env);
  const items: Array<{ title: string; link: string; guid: string; pubDate: string; description: string }> = [];
  // 回填历史登阶会产出同一成员同一时间戳的多条大关——合并成一条，避免订阅器刷屏
  const climbs = new Map<string, typeof stats.recentMilestones>();
  for (const m of stats.recentMilestones) {
    const key = `${m.memberId}@${m.achievedAt}`;
    const arr = climbs.get(key) ?? [];
    arr.push(m);
    climbs.set(key, arr);
  }
  for (const arr of climbs.values()) {
    const m0 = arr[0];
    const titles = arr.map((x) => `「${titleOf(x.threshold)}」`).join("");
    const thresholds = arr.map((x) => badge(x.threshold)).join("、");
    items.push({
      title: `${m0.displayName ?? m0.handle} 拿下称号${titles}`,
      link: `${SITE_URL}/members/${m0.memberId}`,
      guid: `${SITE_URL}/members/${m0.memberId}#m-${arr.map((x) => x.threshold).join("-")}`,
      pubDate: new Date(m0.achievedAt).toUTCString(),
      description: `KOSX 万粉影响力计划：${m0.displayName ?? m0.handle} 跨过 ${thresholds} 粉大关。`,
    });
  }
  for (const p of (stats.topPosts ?? []).slice(0, 10)) {
    items.push({
      title: `${p.member?.displayName ?? p.member?.handle ?? "成员"} 的爆款帖 · ${p.views != null ? badge(p.views) : ""} 浏览`,
      link: p.url,
      guid: p.url,
      pubDate: new Date(p.createdAt).toUTCString(),
      description: (p.text ?? "").slice(0, 160),
    });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>KOSX 万粉影响力计划 · 更新</title><link>${SITE_URL}/</link>
<description>登阶记录与爆款内容</description>
<language>zh-CN</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (i) => `<item><title>${escapeXml(i.title)}</title><link>${i.link}</link><guid isPermaLink="false">${escapeXml(i.guid)}</guid><pubDate>${i.pubDate}</pubDate><description>${escapeXml(i.description)}</description></item>`
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
  if (pathname === "/sitemap.xml") return renderSitemap(env);
  if (pathname === "/llms.txt") return renderLlmsTxt();
  if (pathname === "/feed.xml") return renderFeed(env);
  if (pathname.startsWith("/card/")) {
    const id = pathname.slice("/card/".length).replace(/\.svg$/, "").split("/")[0];
    if (!id) return new Response(renderNotFoundCard("unknown"), { status: 404, headers: { "Content-Type": "image/svg+xml" } });
    const variant = (url.searchParams.get("variant") ?? "default") as "default" | "countdown" | "track";
    return renderMemberCardSvg(id, env, variant);
  }
  return null;
}

/**
 * Cron 分发（wrangler.jsonc triggers.crons）：
 * - `0 * * * *`（整点）：滚动分片采集 + 自助队列兜底（collect）
 * - `30 9 * * *`（每日 09:30）：成员被提及 + 社群信号（共同关注/品味）——纯确定性计算，全在 Worker 内
 * - `5-59/10 * * * *`（错峰每 10 分钟）：只清自助更新队列——提交后数据最长 10 分钟落地，
 *   不必等下一个整点；错峰避开整点避免与采集撞车
 */
export async function runScheduled(env: Env, ctx: ExecutionContext, cron: string): Promise<void> {
  if (cron === "0 * * * *") {
    ctx.waitUntil(
      collect(env, ctx).then((summary) =>
        console.log(`[collect] 完成：成功 ${summary.ok}，失败 ${summary.failed.length}`)
      )
    );
    return;
  }
  if (cron === "30 9 * * *") {
    ctx.waitUntil(
      Promise.all([syncMemberMentions(env), syncCommunitySignals(env)]).then(([mentions, signals]) =>
        console.log(`[daily-signals] 被提及 ${mentions.total} 条（成员 ${mentions.ok}），共同关注 ${signals.following} 条，品味 ${signals.taste} 条`)
      )
    );
    return;
  }
  ctx.waitUntil(
    drainRefreshQueue(env, getSource(env)).then((s) =>
      console.log(`[refresh-queue] 兜底清空：成功 ${s.ok}，失败 ${s.failed}`)
    )
  );
}