/**
 * Server functions：路由 loader 专用的 RPC 边界。
 * 调用共享查询层 queries.ts（内部带 Cache API 缓存），
 * env 通过 cloudflare:workers 按请求获取（Workers 上 env 是请求时注入的）。
 */
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { getDashboardStats, getMemberDetail, getTopPosts, getFanOverview, getTopEngagementMembers, getAnnualReport, getCommunitySignals, getDailyArchive, getInviteLeaders, getContentRecipe } from "./queries";
import type { DashboardStats, MemberDetail, PostItem } from "./stats";

export const fetchDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardStats> => getDashboardStats(env as Env)
);

/** 社群能量报告数据：粉丝画像质量聚合 + 强互动成员（/report 页面用） */
export const fetchReportExtras = createServerFn({ method: "GET" }).handler(async () => {
  const [fanRows, topEngagement] = await Promise.all([getFanOverview(env as Env), getTopEngagementMembers(env as Env)]);
  return { fanRows, topEngagement };
});

/** 年度影响力报告（/annual 页面用） */
export const fetchAnnualReport = createServerFn({ method: "GET" }).handler(async () => getAnnualReport(env as Env));

/** 社群信号（共同关注 / 社群热议，内容页策展） */
export const fetchCommunitySignals = createServerFn({ method: "GET" }).handler(async () => getCommunitySignals(env as Env));

/** 社群日报归档（/daily?date=YYYY-MM-DD 的历史快照） */
export const fetchDailyArchive = createServerFn({ method: "GET" })
  .validator((date: string) => date)
  .handler(async ({ data }) => getDailyArchive(env as Env, data));

/** 邀请裂变荣誉榜（/report 展示） */
export const fetchInviteLeaders = createServerFn({ method: "GET" }).handler(async () => getInviteLeaders(env as Env));

/** 内容配方（内容页：社群黄金时段 + 什么形态最吃香） */
export const fetchContentRecipe = createServerFn({ method: "GET" }).handler(async () => getContentRecipe(env as Env));

export const fetchMemberDetail = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<MemberDetail | null> => getMemberDetail(env as Env, id));

export const fetchTopPosts = createServerFn({ method: "GET" }).handler(
  async (): Promise<PostItem[]> => getTopPosts(env as Env)
);

/** 全站历史 Top 帖：突破 30 天窗口的「社群最火」（posts 表保留窗口内全量数据） */
export const fetchTopPostsAll = createServerFn({ method: "GET" }).handler(
  async (): Promise<PostItem[]> => getTopPosts(env as Env, { days: 3650, limit: 20 })
);