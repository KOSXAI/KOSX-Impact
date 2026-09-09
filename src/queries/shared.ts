/**
 * 共享查询层的公共件：行类型 / SQL 字段常量 / 解析与换算工具。
 * 各查询模块（dashboard / member / community / archive）从这里取公共件。
 */
import type { PostItem } from "../stats";

// 含档案慢变量（bio/banner/verified）：看板 members payload 直接携带，成员广场迷你名片卡零额外查询
export const MEMBER_FIELDS = `id, handle, display_name AS displayName, joined_at AS joinedAt, profile_image AS profileImage, tracks, tags, verified, bio, banner_url AS bannerUrl`;
export const POST_FIELDS = `tweet_id AS tweetId, created_at AS createdAt, text,
  views_count AS views, views_prev AS viewsPrev, recorded_at AS postRecordedAt,
  like_count AS likes, reply_count AS replies,
  retweet_count AS retweets, quote_count AS quotes, bookmark_count AS bookmarks`;

export type MemberRow = {
  id: string;
  handle: string;
  displayName: string | null;
  joinedAt: string;
  profileImage: string | null;
  tracks: string | null;
  tags: string | null;
  verified: number | null;
  bio: string | null;
  bannerUrl: string | null;
};
export type SnapshotRow = { memberId: string; followers: number; recordedAt: string; listedCount?: number | null };
export type PostRow = {
  tweetId: string;
  createdAt: string;
  text: string | null;
  views: number | null;
  viewsPrev: number | null;
  postRecordedAt: string;
  likes: number | null;
  replies: number | null;
  retweets: number | null;
  quotes: number | null;
  bookmarks: number | null;
};

/** members 表的 tracks/tags（JSON 文本，可能为 NULL）→ 数组；解析失败回退空数组 */
export function parseStrArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 任意 JSON 数组解析（对象数组等）：解析失败或非数组回退空数组 */
export function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** 中位数（数值数组，空数组返回 0） */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** posts 表行 → PostItem（拼 x.com 原文外链） */
export function mapPostRow(row: PostRow, handle: string): PostItem {
  return {
    tweetId: row.tweetId,
    createdAt: row.createdAt,
    text: row.text,
    views: row.views,
    likes: row.likes,
    replies: row.replies,
    retweets: row.retweets,
    quotes: row.quotes,
    bookmarks: row.bookmarks,
    url: `https://x.com/${encodeURIComponent(handle)}/status/${row.tweetId}`,
  };
}
