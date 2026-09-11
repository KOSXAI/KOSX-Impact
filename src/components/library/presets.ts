import type { MemberStats } from "@/stats";
import { fmt } from "@/lib/format";
import { titleOf } from "@/milestones";

/**
 * 博主库的「视图」层——飞书多维表格的思路：一个数据集（成员表），多种保存的视图配置。
 * 每个视图 = 上榜过滤 + 排序口径 + 主指标展示；赛道分组与登阶记录是两个特殊视图。
 * URL 只存视图切换与筛选（可分享），布局密度存 localStorage（个人偏好）。
 */

export const VIEW_KEYS = [
  "total",
  "growth",
  "rising",
  "influence",
  "mentions",
  "active",
  "new",
  "track",
  "climbs",
] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

/** 成长视图的指标 × 时间档（多维时间榜口径矩阵） */
export const GROWTH_METRICS = [
  { key: "growth", label: "涨粉" },
  { key: "views", label: "曝光" },
  { key: "posts", label: "发帖" },
  { key: "replies", label: "评论" },
] as const;
export type GrowthMetricKey = (typeof GROWTH_METRICS)[number]["key"];

export const GROWTH_RANGES = [
  { key: 1, label: "今日" },
  { key: 7, label: "近 7 天" },
  { key: 30, label: "近 30 天" },
] as const;
export type GrowthRange = (typeof GROWTH_RANGES)[number]["key"];

/** 按指标×时间档取值：涨粉取快照差值，曝光/发帖/评论取帖子窗口合计 */
export function growthMetricValue(
  m: MemberStats,
  metric: GrowthMetricKey,
  range: GrowthRange,
): number {
  if (metric === "growth")
    return range === 1
      ? (m.growth1d ?? 0)
      : range === 7
        ? m.growth7d
        : m.growth30d;
  if (metric === "views")
    return range === 1
      ? (m.viewsTodayGain ?? 0)
      : range === 7
        ? (m.views7d ?? 0)
        : (m.views30d ?? 0);
  if (metric === "posts")
    return range === 1
      ? (m.postsToday ?? 0)
      : range === 7
        ? (m.posts7d ?? 0)
        : (m.posts30d ?? 0);
  return range === 1
    ? (m.repliesToday ?? 0)
    : range === 7
      ? (m.replies7d ?? 0)
      : (m.replies30d ?? 0);
}

/** 赛道分组视图的组内排序 */
export const TRACK_SORTS = [
  { key: "followers", label: "按粉丝" },
  { key: "growth", label: "按增长" },
] as const;
export type TrackSortKey = (typeof TRACK_SORTS)[number]["key"];

/** 粉丝量分档筛选 */
export const FOLLOWERS_BUCKETS = [
  { key: "all", label: "全部" },
  { key: "lt10k", label: "1万以下" },
  { key: "10k-50k", label: "1万–5万" },
  { key: "gt50k", label: "5万以上" },
] as const;
export type FollowersBucket = (typeof FOLLOWERS_BUCKETS)[number]["key"];

export const BUCKET_MATCH: Record<
  Exclude<FollowersBucket, "all">,
  (f: number) => boolean
> = {
  lt10k: (f) => f < 10_000,
  "10k-50k": (f) => f >= 10_000 && f < 50_000,
  gt50k: (f) => f >= 50_000,
};

/** 行卡/卡片右侧主指标：排什么亮什么 */
export interface MetricValue {
  value: string;
  label: string;
  /** 涨粉类指标用信号色 */
  tone?: "signal";
  /** 第二行补充（距下一称号 / 加入天数） */
  sub?: string;
  /** 距下一大关完成度 0-100（行内细进度条） */
  progress?: number;
}

export interface MetricCtx {
  growthMetric: GrowthMetricKey;
  growthRange: GrowthRange;
  trackSort: TrackSortKey;
}

export interface ViewPreset {
  key: ViewKey;
  label: string;
  /** 上榜过滤（新锐/被提及只留有数据的成员）；缺省不过滤 */
  filter?: (m: MemberStats) => boolean;
  /** 排序比较器（降序在前）；track 分组与 climbs 事件流不用 */
  sort?: (a: MemberStats, b: MemberStats, ctx: MetricCtx) => number;
  /** 主指标；返回 null 则行卡不显示右侧数值 */
  metric: (m: MemberStats, ctx: MetricCtx) => MetricValue | null;
  /** 视图下无数据时的空态文案 */
  empty: string;
}

const followersMetric = (m: MemberStats): MetricValue => ({
  value: fmt(m.latestFollowers ?? 0),
  label: "粉丝",
  sub:
    m.latestFollowers != null
      ? `还差 ${fmt(m.nextMilestone - m.latestFollowers)} 至「${titleOf(m.nextMilestone)}」`
      : m.collectFailed
      ? "首次采集未成功"
      : "排队中",
  progress: m.latestFollowers != null ? m.progressToNext : undefined,
});

export const VIEW_PRESETS: Record<ViewKey, ViewPreset> = {
  total: {
    key: "total",
    label: "总排行",
    sort: (a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0),
    metric: (m) => followersMetric(m),
    empty: "还没有成员上榜。",
  },
  growth: {
    key: "growth",
    label: "成长",
    sort: (a, b, ctx) =>
      growthMetricValue(b, ctx.growthMetric, ctx.growthRange) -
      growthMetricValue(a, ctx.growthMetric, ctx.growthRange),
    metric: (m, ctx) => ({
      value: `+${fmt(growthMetricValue(m, ctx.growthMetric, ctx.growthRange))}`,
      label:
        GROWTH_METRICS.find((x) => x.key === ctx.growthMetric)?.label ?? "涨粉",
      tone: "signal",
    }),
    empty: "成长数据在路上，明天见。",
  },
  rising: {
    key: "rising",
    label: "新锐",
    filter: (m) => m.avgViewsPerPost != null && (m.posts30d ?? 0) >= 1,
    sort: (a, b) => (b.avgViewsPerPost ?? 0) - (a.avgViewsPerPost ?? 0),
    metric: (m) => ({ value: fmt(m.avgViewsPerPost ?? 0), label: "帖均曝光" }),
    empty: "还没有帖子数据，新锐正在路上。",
  },
  influence: {
    key: "influence",
    label: "影响力",
    sort: (a, b) => (b.influence?.score ?? -1) - (a.influence?.score ?? -1),
    metric: (m) => ({ value: fmt(m.influence?.score ?? 0), label: "指数" }),
    empty: "影响力指数还没算出来。",
  },
  mentions: {
    key: "mentions",
    label: "被提及",
    filter: (m) => (m.mentionCount30d ?? 0) > 0,
    sort: (a, b) => (b.mentionCount30d ?? 0) - (a.mentionCount30d ?? 0),
    metric: (m) => ({ value: fmt(m.mentionCount30d ?? 0), label: "次被提及" }),
    empty: "近 30 天还没有被讨论的声音。",
  },
  active: {
    key: "active",
    label: "勤快",
    sort: (a, b) =>
      (b.posts30d ?? 0) * 10_000 +
      (b.posts7d ?? 0) -
      ((a.posts30d ?? 0) * 10_000 + (a.posts7d ?? 0)),
    metric: (m) => ({ value: `${m.posts30d ?? 0} 帖`, label: "近 30 天" }),
    empty: "大家最近都在憋大招。",
  },
  new: {
    key: "new",
    label: "新面孔",
    sort: (a, b) => b.joinedAt.localeCompare(a.joinedAt),
    metric: (m) => {
      const days = Math.max(
        1,
        Math.floor((Date.now() - new Date(m.joinedAt).getTime()) / 86_400_000),
      );
      return {
        value: followersMetric(m).value,
        label: "粉丝",
        sub: `${days} 天前加入`,
      };
    },
    empty: "还没有新成员加入。",
  },
  track: {
    key: "track",
    label: "赛道分组",
    metric: (m, ctx) =>
      ctx.trackSort === "growth"
        ? { value: `+${fmt(m.growth7d)}`, label: "近 7 天", tone: "signal" }
        : followersMetric(m),
    empty: "还没有成员挂在任何赛道。",
  },
  climbs: {
    key: "climbs",
    label: "登阶记录",
    metric: () => null,
    empty: "还没有登阶记录。",
  },
};

/** 库的 URL 状态（口径/筛选进 URL 可分享；布局密度存 localStorage） */
export interface LibrarySearch {
  view?: ViewKey;
  metric?: GrowthMetricKey;
  range?: GrowthRange;
  gsort?: TrackSortKey;
  /** 赛道名，逗号分隔多选 */
  track?: string;
  /** 标签，逗号分隔多选 */
  tag?: string;
  bucket?: Exclude<FollowersBucket, "all">;
}
