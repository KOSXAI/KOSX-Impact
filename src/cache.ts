/**
 * 响应级缓存：用 Workers Cache API 把读端点缓存到边缘，
 * 重复请求不落 D1（数据一天一更，缓存窗口内的旧值完全可接受）。
 *
 * 新鲜度模型（两件套，缺一不可）：
 * - 缓存键带 cache_bust 版本号（site_meta.cache_bust）：每次采集/提交写库都 +1，
 *   新键在全区数据中心必然 miss → 直接回源重建。数据一变，用户刷新立即见新数据，
 *   不再依赖跨数据中心 purge（Cache API 按 colo 隔离，旧 purge 只能清本区）。
 * - Cache-Control 拆开共享/浏览器缓存：s-maxage 管 CDN，max-age 默认 60 秒管浏览器，
 *   用户刷新页面不会命中自己浏览器里的旧 JSON。
 */

export interface CachedResponseOptions {
  /**
   * 浏览器本地缓存秒数：默认 60——刷新页面即可看到新数据，CDN 层仍按 s-maxage 缓存。
   * 高频图片（SVG 卡 / OG 图）传 ttl 让浏览器长缓存。
   */
  browserTtl?: number;
  /** 额外响应头 */
  headers?: Record<string, string>;
}

/**
 * 读端点缓存键的单一事实来源：写缓存（queries.ts / api.ts）统一从这里取值。
 * 键带 ?v= 结构版本，调用处再拼 ?cb= 数据版本（site_meta.cache_bust），
 * 结构升级升 v、数据变化靠 cb 自动换键。
 */
export const CACHE_KEYS = {
  /** 看板统计（首页 SSR 与 /api/dashboard 共用） */
  dashboard: "/api/dashboard?v=14",
  /** 成员列表（/api/members） */
  memberList: "/api/members?v=10",
  /** 站点 OG 图（SVG favicon / 旧预览图，仍被 favicon 引用） */
  og: "/og.svg",
  /** 成员 OG 分享卡（PNG，X/微信分享预览用） */
  ogMember: (id: string) => `/og/members/${id}?v=1`,
  /** 站点 OG 分享卡（PNG） */
  ogSite: "/og/site.png?v=1",
  /** 成员详情（/api/members/:id 与成员页 SSR 共用） */
  memberDetail: (id: string) => `/api/members/${id}?v=10`,
} as const;

export async function cachedResponse(
  request: Request,
  ttl: number,
  build: () => Promise<Response>,
  options?: CachedResponseOptions
): Promise<Response> {
  // DOM lib 的 CacheStorage 与 Workers CacheStorage 同名合并后丢失 default，
  // 此处显式按 Workers 运行时类型取用
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(request.url, { method: "GET" });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const response = await build();
  // 只缓存成功响应；放一份进边缘缓存，返回给调用方 clone。
  // 浏览器缓存 60 秒（SVG 等高频图可传 ttl 覆盖），避免用户刷新命中本地旧数据。
  if (response.status === 200) {
    const browserTtl = options?.browserTtl ?? 60;
    const res = new Response(response.body, response);
    res.headers.set("Cache-Control", `public, s-maxage=${ttl}, max-age=${browserTtl}`);
    if (options?.headers) for (const [k, v] of Object.entries(options.headers)) res.headers.set(k, v);
    await cache.put(cacheKey, res.clone());
    return res;
  }
  return response;
}

/** 读当前 cache_bust（site_meta）：每次数据写库 +1，缓存键随之换新。缺键视为 1。 */
export async function readCacheBust(env: Env): Promise<number> {
  const row = (await env.DB.prepare(
    "SELECT CAST(value AS INTEGER) AS bust FROM site_meta WHERE key = 'cache_bust'"
  ).first()) as { bust: number | null } | null;
  return row?.bust ?? 1;
}