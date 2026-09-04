import { describe, expect, it } from "vitest";
import { badge, nextGoal } from "../src/lib/format";

describe("nextGoal", () => {
  it("万粉之后下一站是下一个标准档位", () => {
    expect(nextGoal(10000)).toBe(25000);
  });

  it("非标准目标指向最近的下一档", () => {
    expect(nextGoal(7000)).toBe(7500);
    expect(nextGoal(15000)).toBe(25000);
  });

  it("十万/百万级目标持续向上，不封顶", () => {
    expect(nextGoal(100000)).toBe(250000);
    expect(nextGoal(1500000)).toBe(2500000);
  });
});

describe("badge", () => {
  it("千/万/十万级档位正确缩写", () => {
    expect(badge(1000)).toBe("1千");
    expect(badge(2500)).toBe("2.5千");
    expect(badge(10000)).toBe("1万");
    expect(badge(100000)).toBe("10万");
    expect(badge(150000)).toBe("15万");
    expect(badge(1000000)).toBe("100万");
  });
});
