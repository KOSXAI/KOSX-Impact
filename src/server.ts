/**
 * Worker 入口（wrangler main）：
 * - fetch：API / SVG 卡 / OG 图 / SEO 文件走 Hono（handleWorkerRoutes），
 *   其余路径交给 TanStack Start 的 Nitro handler 做 SSR。
 * - scheduled：每日 cron 采集，逻辑不变。
 */
import handler from "@tanstack/react-start/server-entry";
import { handleWorkerRoutes, runScheduled } from "./api";

// Nitro 入口的 fetch 在 Cloudflare 上接收 (request, env, ctx)，
// 其自带类型按通用平台声明为 (request, opts)，这里做一次桥接
const ssrFetch = handler.fetch as unknown as (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const workerRes = await handleWorkerRoutes(request, env);
    if (workerRes) return workerRes;
    return ssrFetch(request, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    await runScheduled(env, ctx);
  },
} satisfies ExportedHandler<Env>;