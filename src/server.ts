/**
 * Worker 入口（wrangler main）：
 * - fetch：API / SVG 卡 / OG 图 / SEO 文件走 Hono（handleWorkerRoutes），
 *   其余路径交给 TanStack Start 的 Nitro handler 做 SSR。
 *   所有 Worker 响应统一注入安全响应头；页面 HTML 再加一层短边缘缓存
 *   （键带 cache_bust 数据版本与构建号，数据或代码一变即换键）。
 * - scheduled：整点 cron 滚动采集、错峰 cron 清提交队列（runScheduled 按 event.cron 分发）。
 */
import handler from "@tanstack/react-start/server-entry";
import { handleWorkerRoutes, runScheduled } from "./api";
import { deferCachePut, readCacheBust } from "./cache";

// Nitro 入口的 fetch 在 Cloudflare 上接收 (request, env, ctx)，
// 其自带类型按通用平台声明为 (request, opts)，这里做一次桥接
const ssrFetch = handler.fetch as unknown as (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

/** 基线安全响应头：站点有表单 POST 与大量外链，全响应统一注入 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "SAMEORIGIN",
};

/** 包一层新 Response 注入安全头（不动缓存里已存的副本） */
function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

const htmlCache = (caches as unknown as { default: Cache }).default;

/** SSR 页面的边缘缓存秒数：键里带数据版本与构建号，数据一变、一发版都会自动换键，
 *  所以这里只兜「同一份数据下的重复渲染」，可以比旧的 60 秒放长 */
const HTML_TTL = 300;

/** 只用于站外归因、不影响页面内容的查询参数：不进缓存键，避免同一页被打散成多份 */
const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|igshid|invite)$/i;

/** HTML 缓存键：规范化 URL（去追踪参数、参数排序）+ 数据版本 + 构建号。
 *  构建号保证发版后不会返回引用旧哈希资源的 HTML（旧资源发版后即 404）。 */
async function htmlCacheKey(request: Request, env: Env): Promise<Request> {
  const url = new URL(request.url);
  for (const k of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) url.searchParams.delete(k);
  url.searchParams.sort();
  url.searchParams.set("__cb", String(await readCacheBust(env)));
  url.searchParams.set("__build", typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev");
  return new Request(url.toString(), { method: "GET" });
}

/** SSR 页面边缘缓存：GET + 200 + text/html 才进缓存；max-age=0 让浏览器每次回边缘 */
async function cachedHtml(request: Request, env: Env, build: () => Promise<Response>): Promise<Response> {
  if (request.method !== "GET") return build();
  const key = await htmlCacheKey(request, env);
  const hit = await htmlCache.match(key);
  if (hit) return hit;
  const res = await build();
  if (res.status === 200 && (res.headers.get("Content-Type") ?? "").includes("text/html")) {
    const cached = new Response(res.body, res);
    cached.headers.set("Cache-Control", `public, s-maxage=${HTML_TTL}, max-age=0`);
    // 写缓存放到响应之后（waitUntil），不拖慢首字节
    await deferCachePut(htmlCache.put(key, cached.clone()));
    return cached;
  }
  return res;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const workerRes = await handleWorkerRoutes(request, env);
    if (workerRes) return withSecurityHeaders(workerRes);
    return cachedHtml(request, env, async () => withSecurityHeaders(await ssrFetch(request, env, ctx)));
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    await runScheduled(env, ctx, event.cron);
  },
} satisfies ExportedHandler<Env>;
