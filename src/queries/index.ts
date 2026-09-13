/**
 * 共享查询层：Hono API 路由与 TanStack Start SSR（server functions）都从这里取数。
 * 复用同一批 Cache API 缓存键（按绝对 URL），SSR 与 API 端点共享边缘缓存，
 * 不因前端迁移增加 D1 行读取。缓存键带 cache_bust 数据版本：
 * 采集/提交写库后版本 +1，新键在各区必然 miss → 数据变化后刷新立即可见。
 *
 * 分模块：dashboard（看板 / 精华帖）/ member（成员详情）/ community（社群信号 ·
 * 内容配方 · 报告维度）/ archive（年度 · 社日归档）/ shared（公共件）。
 */
export { getDashboardStats, getTopPosts, getInsights, getMemberPicker } from "./dashboard";
export { getMemberDetail } from "./member";
export { getCommunitySignals, getContentRecipe, getFanOverview, getTopEngagementMembers, getInviteLeaders } from "./community";
export { getAnnualReport, getDailyArchive } from "./archive";
