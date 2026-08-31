import { describe, expect, it } from "vitest";
import { detectMilestones, thresholdsForGoal } from "../src/milestones";

describe("thresholdsForGoal", () => {
  it("包含标准档位与个人目标", () => {
    expect(thresholdsForGoal(10000)).toEqual([1000, 2500, 5000, 7500, 10000]);
  });

  it("个人目标低于标准档位时只保留不高于目标的档位", () => {
    expect(thresholdsForGoal(2000)).toEqual([1000, 2000]);
  });
});

describe("detectMilestones", () => {
  const thresholds = thresholdsForGoal(10000);

  it("跨过多个档位时全部触发", () => {
    expect(detectMilestones(900, 2600, thresholds, "t")).toEqual([
      { threshold: 1000, achievedAt: "t" },
      { threshold: 2500, achievedAt: "t" },
    ]);
  });

  it("没有历史快照时不触发", () => {
    expect(detectMilestones(undefined, 8000, thresholds, "t")).toEqual([]);
  });

  it("未跨过任何档位时不触发", () => {
    expect(detectMilestones(1200, 1300, thresholds, "t")).toEqual([]);
  });
});
