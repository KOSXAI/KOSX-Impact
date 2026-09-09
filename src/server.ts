/**
 * Worker 入口（wrangler main）：
 * - fetch：API / SVG 卡 / OG 图 / SEO 文件走 Hono（handleWorkerRoutes），
 *   其余路径交给 TanStack Start 的 Nitro handler 做 SSR。
 *   所有 Worker 响应统一注入安全响应头；页面 HTML 再加一层短边缘缓存
 *   （数据键由 cache_bust 换新，HTML 60s 窗口内的延迟可接受）。
 * - scheduled：整点 cron 滚动采集、错峰 cron 清提交队列（runScheduled 按 event.cron 分发）。
 */
import handler from "@tanstack/react-start/server-entry";
import { handleWorkerRoutes, runScheduled } from "./api";

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

/** SSR 页面短边缘缓存：GET + 200 + text/html 才进缓存；max-age=0 让浏览器每次回边缘 */
async function cachedHtml(request: Request, build: () => Promise<Response>): Promise<Response> {
  if (request.method !== "GET") return build();
  const hit = await htmlCache.match(request);
  if (hit) return hit;
  const res = await build();
  if (res.status === 200 && (res.headers.get("Content-Type") ?? "").includes("text/html")) {
    const cached = new Response(res.body, res);
    cached.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300, max-age=0");
    await htmlCache.put(request, cached.clone());
    return cached;
  }
  return res;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const workerRes = await handleWorkerRoutes(request, env);
    if (workerRes) return withSecurityHeaders(workerRes);
    return cachedHtml(request, async () => withSecurityHeaders(await ssrFetch(request, env, ctx)));
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    await runScheduled(env, ctx, event.cron);
  },
} satisfies ExportedHandler<Env>;
