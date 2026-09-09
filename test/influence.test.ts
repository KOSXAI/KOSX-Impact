import { describe, expect, it } from "vitest";
import { computeInfluence, type InfluenceInput } from "../src/influence";
import type { PostMetric } from "../src/insights";

const post = (views: number | null, likes = 0, replies = 0, retweets = 0, quotes = 0, bookmarks = 0): PostMetric => ({
  createdAt: "2026-09-01T00:00:00Z",
  views,
  likes,
  replies,
  retweets,
  quotes,
  bookmarks,
});

const input = (over: Partial<InfluenceInput> = {}): InfluenceInput => ({
  followers: 10000,
  growth30d: 0,
  verified: false,
  listedCount: null,
  posts30d: [],
  ...over,
});

describe("computeInfluence · 规模项", () => {
  it("对数映射：千万粉封顶 400，1 粉接近 0", () => {
    expect(computeInfluence(input({ followers: 10_000_000 })).breakdown.scale).toBe(400);
    expect(computeInfluence(input({ followers: 10_000_000_000 })).breakdown.scale).toBe(400); // 超量级仍封顶
    expect(computeInfluence(input({ followers: 1 })).breakdown.scale).toBeLessThan(5);
  });

  it("万粉 ≈ (4/7)×400 ≈ 229", () => {
    expect(computeInfluence(input({ followers: 10_000 })).breakdown.scale).toBe(229);
  });
});

describe("computeInfluence · 增长项", () => {
  it("分母下限 1000 防小号暴涨：小号 30% 增长（300 粉）即满分 200", () => {
    expect(computeInfluence(input({ followers: 500, growth30d: 300 })).breakdown.growth).toBe(200);
    // 下限生效：同样的 300 粉增长在万粉号上只按 3% 计
    expect(computeInfluence(input({ followers: 10_000, growth30d: 300 })).breakdown.growth).toBe(20);
  });

  it("万粉号增长 3000（30%）= 满分；15% = 半分", () => {
    expect(computeInfluence(input({ followers: 10_000, growth30d: 3000 })).breakdown.growth).toBe(200);
    expect(computeInfluence(input({ followers: 10_000, growth30d: 1500 })).breakdown.growth).toBe(100);
  });

  it("负增长照实扣分（负向也计入）", () => {
    const b = computeInfluence(input({ followers: 10_000, growth30d: -1000 })).breakdown;
    expect(b.growth).toBeLessThan(0);
  });
});

describe("computeInfluence · 互动与产能", () => {
  it("无帖子数据：互动/产能记 0，hasPostData=false", () => {
    const r = computeInfluence(input({ posts30d: [] }));
    expect(r.breakdown.engagement).toBe(0);
    expect(r.breakdown.output).toBe(0);
    expect(r.hasPostData).toBe(false);
    expect(r.engagementMedian).toBeNull();
  });

  it("互动率中位数 10% 满分 250；浏览缺失的帖子不参与中位数", () => {
    const posts = [post(1000, 50, 20, 10, 10, 10), post(null), post(4000, 100, 100, 100, 100)];
    // rates: 100/1000=0.1, 400/4000=0.1 → median 0.1 → 250
    const r = computeInfluence(input({ posts30d: posts }));
    expect(r.breakdown.engagement).toBe(250);
    expect(r.engagementMedian).toBeCloseTo(0.1);
  });

  it("产能：30 帖满分 150，超发封顶；15 帖 = 75", () => {
    expect(computeInfluence(input({ posts30d: Array.from({ length: 30 }, () => post(null)) })).breakdown.output).toBe(150);
    expect(computeInfluence(input({ posts30d: Array.from({ length: 100 }, () => post(null)) })).breakdown.output).toBe(150);
    expect(computeInfluence(input({ posts30d: Array.from({ length: 15 }, () => post(null)) })).breakdown.output).toBe(75);
  });
});

describe("computeInfluence · 质量系数", () => {
  it("基准 1.0；认证 +0.15；列表收录 ≥100 +0.10 / ≥20 +0.05；互动率 ≥3% +0.10", () => {
    expect(computeInfluence(input()).qualityMultiplier).toBe(1);
    expect(computeInfluence(input({ verified: true })).qualityMultiplier).toBe(1.15);
    expect(computeInfluence(input({ listedCount: 100 })).qualityMultiplier).toBe(1.15);
    expect(computeInfluence(input({ listedCount: 20 })).qualityMultiplier).toBe(1.05);
    expect(computeInfluence(input({ listedCount: 19 })).qualityMultiplier).toBe(1);
    // 互动率 3% 恰好触发
    expect(
      computeInfluence(input({ posts30d: [post(1000, 30)] })).qualityMultiplier
    ).toBe(1.1);
  });

  it("全加成封顶 1.4，有效粉丝 = 粉丝 × 系数", () => {
    const r = computeInfluence(
      input({ verified: true, listedCount: 200, posts30d: [post(1000, 50)] })
    );
    expect(r.qualityMultiplier).toBe(1.4);
    expect(r.effectiveFollowers).toBe(14_000);
  });
});

describe("computeInfluence · 综合分", () => {
  it("score = 四项之和（四舍五入）；满配输入逐项触顶合计 1000", () => {
    const full = Array.from({ length: 30 }, () => post(1000, 100)); // 互动率 10% 满分 × 30 帖产能满分
    const r = computeInfluence(
      input({ followers: 10_000_000, growth30d: 3_000_000, posts30d: full })
    );
    const b = r.breakdown;
    expect(r.score).toBe(b.scale + b.growth + b.engagement + b.output);
    expect(b.scale).toBe(400);
    expect(b.growth).toBe(200);
    expect(b.engagement).toBe(250);
    expect(b.output).toBe(150);
    expect(r.score).toBe(1000);
  });
});
