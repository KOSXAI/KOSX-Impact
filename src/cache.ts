/**
 * 响应级缓存：用 Workers Cache API 把读端点缓存到边缘，
 * 重复请求不落 D1（数据一天一更，缓存窗口内的旧值完全可接受）。
 *
 * 要点：
 * - Cache API 按数据中心隔离，未命中的数据中心回源一次后即建立缓存
 * - 缓存键用规范化的 URL（去掉查询参数差异可按需调整）
 * - 每个端点自带 TTL（Cache-Control max-age）
 */

export interface CachedResponseOptions {
  /** 边缘缓存秒数（同时写入响应的 Cache-Control） */
  ttl: number;
  /** 额外响应头 */
  headers?: Record<string, string>;
}

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
 */
export async function purgeReadCaches(
  baseUrls: string[],
  memberIds: string[] = []
): Promise<void> {
  const cache = (caches as unknown as { default: Cache }).default;
  const paths = [
    "/api/dashboard?v=5",
    "/api/members?v=5",
    "/og.svg",
    ...memberIds.map((id) => `/api/members/${id}?v=5`),
  ];
  await Promise.all(
    baseUrls.flatMap((base) =>
      paths.map((path) =>
        cache.delete(new Request(base + path, { method: "GET" })).catch(() => undefined)
      )
    )
  );
}