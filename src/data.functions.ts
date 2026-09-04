/**
 * Server functions：路由 loader 专用的 RPC 边界。
 * 调用共享查询层 queries.ts（内部带 Cache API 缓存），
 * env 通过 cloudflare:workers 按请求获取（Workers 上 env 是请求时注入的）。
 */
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { getDashboardStats, getMemberDetail } from "./queries";
import type { DashboardStats, MemberDetail } from "./stats";

export const fetchDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardStats> => getDashboardStats(env as Env)
);

export const fetchMemberDetail = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<MemberDetail | null> => getMemberDetail(env as Env, id));