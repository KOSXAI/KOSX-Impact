/**
 * 测试/独立 API 入口：仅导出 Hono fetch 与 scheduled，
 * 不引入 TanStack SSR（vitest 环境无法解析 #tanstack-*-entry 虚拟模块）。
 */
import { honoApp, runScheduled } from "./api";

export default {
  fetch: honoApp.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    await runScheduled(env, ctx);
  },
} satisfies ExportedHandler<Env>;