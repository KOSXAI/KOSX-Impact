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
  const cache = caches.default;
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