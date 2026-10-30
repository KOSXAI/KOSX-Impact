/**
 * Server functions：路由 loader 专用的 RPC 边界。
 * 调用共享查询层 queries/（内部带 Cache API 缓存），
 * env 通过 cloudflare:workers 按请求获取（Workers 上 env 是请求时注入的）。
 */
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { getDashboardStats, getDashboardSummary, getMemberDetail, getTopPosts, getFanOverview, getTopEngagementMembers, getAnnualReport, getCommunitySignals, getDailyArchive, getInviteLeaders, getContentRecipe, getInsights, getMemberPicker } from "./queries";
import type { DashboardStats, MemberDetail, PostItem } from "./stats";

export const fetchDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardStats> => {
    const stats = await getDashboardStats(env as Env);
    // 注水数据瘦身：以下三个字段没有任何组件消费（品牌声量整线下架后遗留），
    // 却会随 SSR payload 发到全部 dashboard 消费路由的客户端。此处剥掉，
    // /api/dashboard 的对外契约保持不变。
    const { mentions: _mentions, mentionsTrend: _mentionsTrend, mutualEdges: _mutualEdges, ...ui } = stats;
    return ui as DashboardStats;
  }
);

/** 报告板块门牌数（/reports 页用：今日登阶 / 成员数 / 累计粉丝），不连带拉整份 dashboard */
export const fetchDashboardSummary = createServerFn({ method: "GET" }).handler(
  async () => getDashboardSummary(env as Env)
);

/** 内容洞察轻量包（/posts 页用：爆款/停更/标签云），不连带拉整份 dashboard */
export const fetchInsights = createServerFn({ method: "GET" }).handler(
  async () => getInsights(env as Env)
);

/** 对比页选人列表（/compare 页用），不连带拉整份 dashboard */
export const fetchMemberPicker = createServerFn({ method: "GET" }).handler(
  async () => getMemberPicker(env as Env)
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

/** 社群日报归档（/daily?date=YYYY-MM-DD 的历史快照）。
 *  date 是可直接调用的 serverFn 入参：必须严格白名单（格式 + 不得未来日期），
 *  否则会顺着 CACHE_KEYS.dailyArchive 拼进缓存键——含 `/`、`..`、`#` 的串
 *  经 URL 规范化后能把内容写进别的路径的缓存（缓存投毒）。 */
export const fetchDailyArchive = createServerFn({ method: "GET" })
  .validator((date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new Error("invalid_date");
    }
    if (date > new Date().toISOString().slice(0, 10)) throw new Error("future_date");
    return date;
  })
  .handler(async ({ data }) => getDailyArchive(env as Env, data));

/** 邀请裂变荣誉榜（/report 展示） */
export const fetchInviteLeaders = createServerFn({ method: "GET" }).handler(async () => getInviteLeaders(env as Env));

/** 内容配方（内容页：社群黄金时段 + 什么形态最吃香） */
export const fetchContentRecipe = createServerFn({ method: "GET" }).handler(async () => getContentRecipe(env as Env));

export const fetchMemberDetail = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<MemberDetail | null> => getMemberDetail(env as Env, id));

export const fetchTopPosts = createServerFn({ method: "GET" }).handler(
  async (): Promise<PostItem[]> => getTopPosts(env as Env, { limit: 50 })
);

/** 全站历史 Top 帖：突破 30 天窗口的「社群最火」（posts 表保留窗口内全量数据）。
 *  拉深到 50 帖：精华帖列表的形态筛选/互动率排序在客户端做，池子浅了筛不出东西。 */
export const fetchTopPostsAll = createServerFn({ method: "GET" }).handler(
  async (): Promise<PostItem[]> => getTopPosts(env as Env, { days: 3650, limit: 50 })
);