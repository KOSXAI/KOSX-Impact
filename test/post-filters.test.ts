import { describe, expect, it } from "vitest";
import {
  countByPostFilter,
  matchesPostFilter,
  sortPosts,
  type PostFilterKey,
} from "../src/lib/post-filters";
import type { PostItem } from "../src/stats";

/** 最小可用 PostItem（只带筛选/排序要读的字段） */
function post(over: Partial<PostItem> & { tweetId: string }): PostItem {
  return {
    createdAt: "2026-09-01T00:00:00Z",
    text: null,
    views: null,
    likes: null,
    replies: null,
    retweets: null,
    quotes: null,
    bookmarks: null,
    url: "https://x.com/a/status/1",
    ...over,
  };
}

describe("matchesPostFilter", () => {
  const original = post({ tweetId: "1", tweetType: "tweet" });
  const quote = post({ tweetId: "2", tweetType: "quote" });
  const photoPost = post({ tweetId: "3", tweetType: "tweet", media: [{ kind: "photo", url: "u" }] });
  const videoPost = post({ tweetId: "4", tweetType: "tweet", media: [{ kind: "video", url: "u" }] });
  const unenriched = post({ tweetId: "5", tweetType: null, media: null });

  it("原创：只认 tweet_type=tweet，未补齐字段的行不归入", () => {
    expect(matchesPostFilter(original, "original")).toBe(true);
    expect(matchesPostFilter(quote, "original")).toBe(false);
    expect(matchesPostFilter(unenriched, "original")).toBe(false);
  });
  it("带图/视频按 media 判断；引用按 tweet_type=quote", () => {
    expect(matchesPostFilter(photoPost, "photo")).toBe(true);
    expect(matchesPostFilter(photoPost, "video")).toBe(false);
    expect(matchesPostFilter(videoPost, "video")).toBe(true);
    expect(matchesPostFilter(quote, "quote")).toBe(true);
    expect(matchesPostFilter(original, "quote")).toBe(false);
  });
  it("媒体帖同时也可能是原创（一个帖可命中多个筛选维度）", () => {
    expect(matchesPostFilter(photoPost, "original")).toBe(true);
    expect(matchesPostFilter(photoPost, "photo")).toBe(true);
  });
  it("all 全命中", () => {
    for (const p of [original, quote, photoPost, videoPost, unenriched]) {
      expect(matchesPostFilter(p, "all")).toBe(true);
    }
  });
});

describe("countByPostFilter", () => {
  it("all 计数为池子总数，媒体帖同时计入原创（口径与筛选一致）", () => {
    const counts = countByPostFilter([
      post({ tweetId: "1", tweetType: "tweet" }),
      post({ tweetId: "2", tweetType: "quote" }),
      post({ tweetId: "3", tweetType: "tweet", media: [{ kind: "photo", url: "u" }] }),
      post({ tweetId: "4", tweetType: "tweet", media: [{ kind: "video", url: "u" }] }),
      post({ tweetId: "5", tweetType: null }),
    ]);
    expect(counts).toEqual({ all: 5, original: 3, photo: 1, video: 1, quote: 1 });
  });
});

describe("sortPosts", () => {
  it("浏览排序保持服务端顺序（服务端带 NULL 互动兜底，客户端不可重排）", () => {
    const pool = [post({ tweetId: "a", views: 5, likes: 999 }), post({ tweetId: "b", views: 100, likes: 1 })];
    expect(sortPosts(pool, "views")).toBe(pool);
  });
  it("点赞排序按 likes 降序，缺失视为 0", () => {
    const sorted = sortPosts(
      [post({ tweetId: "a", likes: 3 }), post({ tweetId: "b", likes: 100 }), post({ tweetId: "c" })],
      "likes"
    );
    expect(sorted.map((p) => p.tweetId)).toEqual(["b", "a", "c"]);
  });
  it("互动率排序只保留浏览达门槛的帖子，按比率降序", () => {
    const hi = post({ tweetId: "hi", views: 1000, likes: 100 }); // 10%
    const mid = post({ tweetId: "mid", views: 1000, likes: 20, replies: 10 }); // 3%
    const tiny = post({ tweetId: "tiny", views: 5, likes: 4 }); // 80% 但样本是噪声
    const noViews = post({ tweetId: "nv", views: null, likes: 500 });
    const sorted = sortPosts([mid, tiny, hi, noViews], "rate");
    expect(sorted.map((p) => p.tweetId)).toEqual(["hi", "mid"]); // tiny(80%) 与无浏览帖被门槛滤掉
  });
});
