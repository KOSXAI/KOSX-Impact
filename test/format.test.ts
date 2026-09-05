import { describe, expect, it } from "vitest";
import { badge } from "../src/lib/format";

describe("badge", () => {
  it("千/万/十万级档位正确缩写", () => {
    expect(badge(1000)).toBe("1千");
    expect(badge(1500)).toBe("1.5千");
    expect(badge(2500)).toBe("2.5千");
    expect(badge(10000)).toBe("1万");
    expect(badge(100000)).toBe("10万");
    expect(badge(150000)).toBe("15万");
    expect(badge(1000000)).toBe("100万");
    expect(badge(100000000)).toBe("1亿");
    expect(badge(150000000)).toBe("1.5亿");
  });
});
