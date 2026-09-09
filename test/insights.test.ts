import { describe, expect, it } from "vitest";
import { computeMemberInsights, detectInactive, detectViral, engagementRate, medianEngagement, type PostMetric } from "../src/insights";

const post = (over: Partial<PostMetric> = {}): PostMetric => ({
  createdAt: "2026-09-01T00:00:00Z",
  views: 1000,
  likes: 0,
  replies: 0,
  retweets: 0,
  quotes: 0,
  bookmarks: 0,
  ...over,
});

describe("engagementRate", () => {
  it("(赞+评+转+引+藏)/浏览；引与藏计入", () => {
    expect(engagementRate(post({ views: 1000, likes: 30, replies: 10, retweets: 10, quotes: 5, bookmarks: 5 }))).toBe(0.06);
  });

  it("浏览缺失 / 0 / 负数 → null（缺失值不进比率）", () => {
    expect(engagementRate(post({ views: null }))).toBeNull();
    expect(engagementRate(post({ views: 0 }))).toBeNull();
    expect(engagementRate(post({ views: -1 }))).toBeNull();
  });

  it("互动字段缺失按 0 兜底", () => {
    expect(engagementRate(post({ views: 100 }))).toBe(0);
  });
});

describe("medianEngagement", () => {
  it("无有效数据 → null；偶数个取中间均值", () => {
    expect(medianEngagement([post({ views: null })])).toBeNull();
    expect(medianEngagement([post({ views: 100, likes: 5 }), post({ views: 100, likes: 15 })])).toBe(0.1);
  });
});

describe("detectViral", () => {
  it("帖子 <3 不识别（样本太小）", () => {
    expect(detectViral([post({ views: 99_999 }), post({ views: 99_999 })])).toEqual([]);
  });

  it("浏览 ≥5000 且 ≥ 均值×2 才算爆款；边界值（恰 5000、恰 2×均值）算", () => {
    // 均值 = (5000+5000+0)/3？ views=0 被过滤 → withViews 2 帖 <3 不识别，换数据：
    const posts = [post({ views: 20_000 }), post({ views: 5000 }), post({ views: 5000 })];
    // 均值 = 10000；2×均值 = 20000：20000 帖恰好达标
    expect(detectViral(posts)).toHaveLength(1);
    expect(detectViral(posts)[0].views).toBe(20_000);
  });

  it("高浏览但低于均值×2 不算爆款", () => {
    const posts = [post({ views: 6000 }), post({ views: 6000 }), post({ views: 6000 })];
    expect(detectViral(posts)).toEqual([]);
  });
});

describe("detectInactive", () => {
  it("最近一帖 >14 天 → 停更；恰 14 天不停更", () => {
    const r = detectInactive([post({ createdAt: "2026-08-20T00:00:00Z" })], "2026-09-04T00:00:00Z");
    expect(r.inactive).toBe(true);
    expect(r.days).toBe(15);
    const ok = detectInactive([post({ createdAt: "2026-08-21T00:00:00Z" })], "2026-09-04T00:00:00Z");
    expect(ok.inactive).toBe(false);
    expect(ok.days).toBe(14);
  });

  it("无帖子 → 未停更 + days=null", () => {
    expect(detectInactive([], "2026-09-04T00:00:00Z")).toEqual({ inactive: false, days: null, lastPostAt: null });
  });

  it("多帖取最近一条判定", () => {
    const r = detectInactive(
      [post({ createdAt: "2026-08-01T00:00:00Z" }), post({ createdAt: "2026-09-03T00:00:00Z" })],
      "2026-09-04T00:00:00Z"
    );
    expect(r.inactive).toBe(false);
    expect(r.lastPostAt).toBe("2026-09-03T00:00:00Z");
  });
});

describe("computeMemberInsights", () => {
  it("组合输出：发帖数 / 中位数 / 爆款 / 停更", () => {
    const now = "2026-09-04T00:00:00Z";
    const ins = computeMemberInsights(
      [
        post({ views: 20_000, likes: 100 }),
        post({ views: 5000, likes: 10 }),
        post({ views: 5000, likes: 10 }),
      ],
      now
    );
    expect(ins.postCount30d).toBe(3);
    expect(ins.virals).toHaveLength(1);
    expect(ins.inactive).toBe(false);
    expect(ins.engagementMedian).toBeGreaterThan(0);
  });
});
