/**
 * 精华帖列表（/posts）的形态筛选与排序：纯函数，无 D1/缓存依赖。
 * 数据池由 fetchTopPosts 提供（50 帖），筛选/重排全部在客户端做，零额外请求。
 */
import type { PostItem } from "../stats";
import { engagementRate } from "../insights";

export type PostFilterKey = "all" | "original" | "photo" | "video" | "quote";

/** 筛选选项（顺序即展示顺序）；计数由调用方算好拼在 chip 上 */
export const POST_FILTERS = [
  { key: "all", label: "全部" },
  { key: "original", label: "原创" },
  { key: "photo", label: "带图" },
  { key: "video", label: "视频" },
  { key: "quote", label: "引用" },
] as const satisfies ReadonlyArray<{ key: PostFilterKey; label: string }>;

export type PostSortKey = "views" | "likes" | "rate";

export const POST_SORTS = [
  { key: "views", label: "浏览" },
  { key: "likes", label: "点赞" },
  { key: "rate", label: "互动率" },
] as const satisfies ReadonlyArray<{ key: PostSortKey; label: string }>;

/** 互动率排序的最小浏览门槛：低于此样本的比率是噪声（5 浏 3 赞 = 60%） */
export const RATE_MIN_VIEWS = 200;

/** 帖子是否命中形态筛选；tweet_type 为 null（未补齐字段的历史行）不归入任何具体形态 */
export function matchesPostFilter(p: PostItem, filter: PostFilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "original":
      return p.tweetType === "tweet";
    case "photo":
      return (p.media ?? []).some((m) => m.kind === "photo");
    case "video":
      return (p.media ?? []).some((m) => m.kind !== "photo");
    case "quote":
      return p.tweetType === "quote";
  }
}

/** 各形态命中数（筛选 chip 计数；调用方据此隐藏 0 命中的 chip） */
export function countByPostFilter(posts: PostItem[]): Record<PostFilterKey, number> {
  const counts = { all: posts.length, original: 0, photo: 0, video: 0, quote: 0 };
  for (const p of posts) {
    if (p.tweetType === "tweet") counts.original++;
    if ((p.media ?? []).some((m) => m.kind === "photo")) counts.photo++;
    if ((p.media ?? []).some((m) => m.kind !== "photo")) counts.video++;
    if (p.tweetType === "quote") counts.quote++;
  }
  return counts;
}

/**
 * 排序：
 * - 浏览：保持服务端顺序（服务端带 NULL 互动兜底口径，客户端按裸 views 重排会丢）
 * - 点赞：likes 降序
 * - 互动率：只保留浏览 ≥ RATE_MIN_VIEWS 的帖子，按比率降序（小样本比率是噪声）
 */
export function sortPosts(posts: PostItem[], sort: PostSortKey): PostItem[] {
  if (sort === "views") return posts;
  if (sort === "likes") return [...posts].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  return posts
    .filter((p) => (p.views ?? 0) >= RATE_MIN_VIEWS)
    .sort((a, b) => (engagementRate(b) ?? 0) - (engagementRate(a) ?? 0));
}
