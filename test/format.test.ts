import { describe, expect, it } from "vitest";
import { badge, postExcerpt } from "../src/lib/format";

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

describe("postExcerpt", () => {
  it("全文只有一条链接 / 无内容时返回 null", () => {
    expect(postExcerpt("https://t.co/abc123")).toBeNull();
    expect(postExcerpt(null)).toBeNull();
    expect(postExcerpt("   ")).toBeNull();
  });
  it("剥离正文中的裸链接并压平空白", () => {
    expect(postExcerpt("看看这个 https://t.co/abc 很赞")).toBe("看看这个 很赞");
    expect(postExcerpt("https://t.co/x 这个提示词的审美无敌了啊")).toBe("这个提示词的审美无敌了啊");
  });
  it("截断不吞掉链接后面的正文，剥完为空返回 null", () => {
    expect(postExcerpt("正文 https://t.co/xxxxx 尾巴也要留下")).toBe("正文 尾巴也要留下");
    const long = "a".repeat(40) + " https://t.co/xxxxx";
    expect(postExcerpt(long)).toBe("a".repeat(34) + "…");
  });
});
