import { describe, expect, it } from "vitest";
import {
  detectMilestones,
  nextThreshold,
  prevThreshold,
  progressToNext,
  tierOf,
  UNIFORM_THRESHOLDS,
} from "../src/milestones";

describe("UNIFORM_THRESHOLDS", () => {
  it("严格升序且每个数量级内 18 档", () => {
    for (let i = 1; i < UNIFORM_THRESHOLDS.length; i++) {
      expect(UNIFORM_THRESHOLDS[i]).toBeGreaterThan(UNIFORM_THRESHOLDS[i - 1]);
    }
    const countIn = (min: number, max: number) =>
      UNIFORM_THRESHOLDS.filter((t) => t >= min && t < max).length;
    expect(countIn(100, 1000)).toBe(9); // 百粉段每 100 一档
    expect(countIn(1000, 10_000)).toBe(18); // 千粉段每 500 一档
    expect(countIn(10_000, 100_000)).toBe(18); // 万粉段每 5000 一档
    expect(countIn(100_000, 1_000_000)).toBe(18); // 十万粉段每 5 万一档
  });

  it("覆盖千/万/十万/百万/千万量级", () => {
    expect(UNIFORM_THRESHOLDS).toContain(1000);
    expect(UNIFORM_THRESHOLDS).toContain(10000);
    expect(UNIFORM_THRESHOLDS).toContain(100000);
    expect(UNIFORM_THRESHOLDS).toContain(1000000);
    expect(UNIFORM_THRESHOLDS).toContain(10000000);
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

describe("台阶定位", () => {
  it("定位当前台阶与下一台阶", () => {
    expect(prevThreshold(216)).toBe(200);
    expect(nextThreshold(216)).toBe(300);
    expect(prevThreshold(1000)).toBe(1000);
    expect(nextThreshold(1000)).toBe(1500);
    expect(prevThreshold(14616)).toBe(10000);
    expect(nextThreshold(14616)).toBe(15000);
    expect(nextThreshold(50)).toBe(100);
  });

  it("台阶进度：站上台阶时为 0，接近下一级时逼近 100", () => {
    expect(progressToNext(216)).toBe(16); // (216-200)/(300-200)
    expect(progressToNext(1000)).toBe(0);
    expect(progressToNext(14616)).toBe(92); // (14616-10000)/(15000-10000)
    expect(progressToNext(200)).toBe(0);
  });

  it("超过最高档时按最后一段步长继续", () => {
    expect(nextThreshold(10_000_000_000)).toBeGreaterThan(10_000_000_000);
  });
});

describe("detectMilestones", () => {
  it("跨过多个台阶时全部触发", () => {
    expect(detectMilestones(900, 2600, UNIFORM_THRESHOLDS, "t")).toEqual([
      { threshold: 1000, achievedAt: "t" },
      { threshold: 1500, achievedAt: "t" },
      { threshold: 2000, achievedAt: "t" },
      { threshold: 2500, achievedAt: "t" },
    ]);
  });

  it("没有历史快照时不触发", () => {
    expect(detectMilestones(undefined, 8000, UNIFORM_THRESHOLDS, "t")).toEqual([]);
  });

  it("未跨过任何台阶时不触发", () => {
    expect(detectMilestones(1200, 1300, UNIFORM_THRESHOLDS, "t")).toEqual([]);
  });
});
