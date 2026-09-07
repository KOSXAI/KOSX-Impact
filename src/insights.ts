/**
 * 内容洞察纯函数：互动率 / 爆款识别 / 停更检测。
 * 数据全部来自 posts 表（近 30 天窗口），话题标签云由成员 tags 在查询层聚合。
 *
 * 口径边界：
 * - 互动率缺失浏览的帖子不参与（与 top-posts 的 COALESCE 兜底不同——兜底只用于排序，
 *   比率计算用缺失值会放大噪音）
 * - 爆款：浏览 ≥ 5000 且 ≥ 该成员近 30 天均值 ×2；帖子不足 3 帖不识别（样本太小）
 * - 停更：最近一条帖子距今 > 14 天
 */

export interface PostMetric {
  createdAt: string;
  views: number | null;
  likes: number | null;
  replies: number | null;
  retweets: number | null;
  quotes: number | null;
  bookmarks: number | null;
}

/** 单帖互动率 = (赞+评+转+引+藏)/浏览；浏览缺失或非正数返回 null */
export function engagementRate(p: PostMetric): number | null {
  if (typeof p.views !== "number" || p.views <= 0) return null;
  const total =
    (p.likes ?? 0) + (p.replies ?? 0) + (p.retweets ?? 0) + (p.quotes ?? 0) + (p.bookmarks ?? 0);
  return total / p.views;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 近 30 天帖子互动的中位数互动率（0-1；无有效数据为 null） */
export function medianEngagement(posts: PostMetric[]): number | null {
  return median(posts.map(engagementRate).filter((r): r is number => r !== null));
}

/** 爆款识别：近 30 天内浏览超阈值且显著高于本人均值（帖子 <3 不识别） */
export function detectViral<T extends PostMetric>(posts: T[]): T[] {
  const withViews = posts.filter((p) => typeof p.views === "number" && p.views > 0);
  if (withViews.length < 3) return [];
  const mean = withViews.reduce((s, p) => s + (p.views ?? 0), 0) / withViews.length;
  return withViews.filter((p) => (p.views ?? 0) >= 5000 && (p.views ?? 0) >= mean * 2);
}

/** 停更检测：最近一条帖子距今天数；无帖子数据时返回 inactive=false + days=null */
export function detectInactive(
  posts: PostMetric[],
  now: string,
  days = 14
): { inactive: boolean; days: number | null; lastPostAt: string | null } {
  if (posts.length === 0) return { inactive: false, days: null, lastPostAt: null };
  const lastPostAt = posts
    .map((p) => p.createdAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const elapsed = Math.floor((Date.parse(now) - Date.parse(lastPostAt)) / 86_400_000);
  return { inactive: elapsed > days, days: Math.max(elapsed, 0), lastPostAt };
}

export interface MemberInsights<TPost extends PostMetric = PostMetric> {
  /** 近 30 天发帖数 */
  postCount30d: number;
  /** 互动率中位数（0-1；无有效帖子数据为 null） */
  engagementMedian: number | null;
  /** 爆款帖（近 30 天；保留传入帖子的完整结构） */
  virals: TPost[];
  /** 停更判定（近 14 天无新帖） */
  inactive: boolean;
  inactiveDays: number | null;
  lastPostAt: string | null;
}

export function computeMemberInsights<TPost extends PostMetric>(
  posts30d: TPost[],
  now: string
): MemberInsights<TPost> {
  const inactive = detectInactive(posts30d, now);
  return {
    postCount30d: posts30d.length,
    engagementMedian: medianEngagement(posts30d),
    virals: detectViral(posts30d),
    inactive: inactive.inactive,
    inactiveDays: inactive.days,
    lastPostAt: inactive.lastPostAt,
  };
}