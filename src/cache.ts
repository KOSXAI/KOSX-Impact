/**
 * 响应级缓存：用 Workers Cache API 把读端点缓存到边缘，
 * 重复请求不落 D1（数据一天一更，缓存窗口内的旧值完全可接受）。
 *
 * 要点：
 * - Cache API 按数据中心隔离，未命中的数据中心回源一次后即建立缓存
 * - 缓存键由 CACHE_KEYS 统一维护（查询层写、purge 清共用同一份），升版本号只改一处
 * - 版本 bump 后的旧键（含裸 URL）不再写入，但残留缓存仍会按旧结构服务到 TTL 过期，
 *   所以 purge 时会一并清理历史键，避免结构变更后的"幽灵旧数据"
 * - 每个端点自带 TTL（Cache-Control max-age）
 */

export interface CachedResponseOptions {
  /** 边缘缓存秒数（同时写入响应的 Cache-Control） */
  ttl: number;
  /** 额外响应头 */
  headers?: Record<string, string>;
}

/**
 * 读端点缓存键的单一事实来源：写缓存（queries.ts / api.ts）与清缓存（purgeReadCaches）
 * 都从这里取值。键带 ?v= 版本号用于结构变更时立即失效：升号后新键首次请求必然 miss。
 */
export const CACHE_KEYS = {
  /** 看板统计（首页 SSR 与 /api/dashboard 共用） */
  dashboard: "/api/dashboard?v=13",
  /** 成员列表（/api/members） */
  memberList: "/api/members?v=10",
  /** 站点 OG 图 */
  og: "/og.svg",
  /** 成员详情（/api/members/:id 与成员页 SSR 共用） */
  memberDetail: (id: string) => `/api/members/${id}?v=10`,
} as const;

export async function cachedResponse(
  request: Request,
  ttl: number,
  build: () => Promise<Response>
): Promise<Response> {
  // DOM lib 的 CacheStorage 与 Workers CacheStorage 同名合并后丢失 default，
  // 此处显式按 Workers 运行时类型取用
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(request.url, { method: "GET" });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const response = await build();
  // 只缓存成功响应；放一份进边缘缓存，返回给调用方 clone
  if (response.status === 200) {
    const res = new Response(response.body, response);
    res.headers.set("Cache-Control", `public, max-age=${ttl}`);
    await cache.put(cacheKey, res.clone());
    return res;
  }
  return response;
}

/**
 * 采集完成后主动清缓存：新数据立即可见，不必等 TTL 自然过期。
 * Cache API 的 delete 只作用于当前数据中心，但采集源（cron）在固定区域跑，
 * 各边缘节点会在 TTL 内自然过期——主动 purge 是"尽力而为"的加速，不是保证。
 * 除看板/列表/OG 外，还按成员 id 清详情缓存（API 与成员页 SSR 共用同一键）。
 * 历史裸 URL 键一并清理：版本 bump 前的残留会按旧结构服务，不能留下。
 */
export async function purgeReadCaches(
  baseUrls: string[],
  memberIds: string[] = []
): Promise<void> {
  const cache = (caches as unknown as { default: Cache }).default;
  const paths = [
    CACHE_KEYS.dashboard,
    CACHE_KEYS.memberList,
    CACHE_KEYS.og,
    // 结构变更前的历史键（早期版本用过裸 URL，无版本号）
    "/api/dashboard",
    "/api/members",
    ...memberIds.flatMap((id) => [CACHE_KEYS.memberDetail(id), `/api/members/${id}`]),
  ];
  await Promise.all(
    baseUrls.flatMap((base) =>
      paths.map((path) =>
        cache.delete(new Request(base + path, { method: "GET" })).catch(() => undefined)
      )
    )
  );
}