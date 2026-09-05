import { describe, expect, it } from "vitest";
import {
  detectMilestones,
  MILESTONES,
  MILESTONE_THRESHOLDS,
  nextThreshold,
  prevThreshold,
  progressToNext,
  tierOf,
  titleOf,
} from "../src/milestones";

describe("MILESTONES", () => {
  it("门槛严格升序且每道大关都有称号", () => {
    for (let i = 1; i < MILESTONE_THRESHOLDS.length; i++) {
      expect(MILESTONE_THRESHOLDS[i]).toBeGreaterThan(MILESTONE_THRESHOLDS[i - 1]);
    }
    expect(MILESTONES.every((m) => m.title.length > 0)).toBe(true);
  });

  it("覆盖关键档位：百粉/五百粉/千粉/五千粉/万粉/十万粉/百万粉", () => {
    expect(MILESTONE_THRESHOLDS).toContain(100);
    expect(MILESTONE_THRESHOLDS).toContain(500);
    expect(MILESTONE_THRESHOLDS).toContain(1000);
    expect(MILESTONE_THRESHOLDS).toContain(5000);
    expect(MILESTONE_THRESHOLDS).toContain(10000);
    expect(MILESTONE_THRESHOLDS).toContain(100000);
    expect(MILESTONE_THRESHOLDS).toContain(1000000);
  });

  it("称号表：万粉是「万人迷」，五千粉是「学富五车」", () => {
    expect(titleOf(10000)).toBe("万人迷");
    expect(titleOf(5000)).toBe("学富五车");
    expect(titleOf(100)).toBe("百里挑一");
    expect(titleOf(500)).toBe("五福临门");
  });
});

describe("tierOf", () => {
  it("按量级取段位，只升不降", () => {
    expect(tierOf(0).key).toBe("seed");
    expect(tierOf(500).key).toBe("seed");
    expect(tierOf(1000).key).toBe("thousand");
    expect(tierOf(14616).key).toBe("tenk");
    expect(tierOf(250000).key).toBe("hundredk");
    expect(tierOf(1000000).key).toBe("million");
    expect(tierOf(12000000).key).toBe("tenm");
    expect(tierOf(150000000).key).toBe("hundredm");
  });
});

describe("大关定位", () => {
  it("定位当前赛段与下一道大关", () => {
    expect(prevThreshold(216)).toBe(100);
    expect(nextThreshold(216)).toBe(500);
    expect(prevThreshold(1000)).toBe(1000);
    expect(nextThreshold(1000)).toBe(5000);
    expect(prevThreshold(14616)).toBe(10000);
    expect(nextThreshold(14616)).toBe(15000);
    expect(nextThreshold(50)).toBe(100);
    expect(prevThreshold(50)).toBe(0);
  });

  it("大关进度：站上大关时为 0，接近下一关时逼近 100", () => {
    expect(progressToNext(216)).toBe(29); // (216-100)/(500-100)
    expect(progressToNext(1000)).toBe(0);
    expect(progressToNext(14616)).toBe(92); // (14616-10000)/(15000-10000)
    expect(progressToNext(200)).toBe(25); // (200-100)/(500-100)
  });

  it("超过最高关时翻倍继续且始终严格递增", () => {
    const next = nextThreshold(10_000_000_000);
    expect(next).toBeGreaterThan(10_000_000_000);
    expect(nextThreshold(next)).toBeGreaterThan(next);
  });
});

describe("detectMilestones", () => {
  it("跨过多个大关时全部触发", () => {
    expect(detectMilestones(900, 6000, MILESTONE_THRESHOLDS, "t")).toEqual([
      { threshold: 1000, achievedAt: "t" },
      { threshold: 5000, achievedAt: "t" },
    ]);
  });

  it("没有历史快照时不触发", () => {
    expect(detectMilestones(undefined, 8000, MILESTONE_THRESHOLDS, "t")).toEqual([]);
  });

  it("未跨过任何大关时不触发", () => {
    expect(detectMilestones(1200, 1300, MILESTONE_THRESHOLDS, "t")).toEqual([]);
  });
});
