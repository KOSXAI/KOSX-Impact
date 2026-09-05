import { describe, expect, it } from "vitest";
import { memberOgSvg, siteOgSvg } from "../src/og";
import type { MemberStats } from "../src/stats";

const base: MemberStats = {
  id: "alice",
  handle: "alice_x",
  displayName: "Alice",
  joinedAt: "2026-08-01",
  profileImage: null,
  baselineFollowers: 1000,
  latestFollowers: 8600,
  latestRecordedAt: "2026-09-01T00:00:00Z",
  growth: 7600,
  growth7d: 123,
  growth30d: 456,
  daysSinceUpdate: 1,
  tierKey: "thousand",
  tierName: "千粉新秀",
  prevMilestone: 5000,
  nextMilestone: 10000,
  progressToNext: 72,
  climbs: 3,
};

const logo = { href: "data:image/png;base64,QUJD", aspect: 6 };

describe("memberOgSvg", () => {
  it("输出 1200×630 画布并包含身份与数据要素", () => {
    const svg = memberOgSvg(base, { climbs: 3, logo });
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg).toContain(">Alice<");
    expect(svg).toContain("@alice_x");
    expect(svg).toContain("千粉新秀");
    expect(svg).toContain("8,600");
    expect(svg).toContain("称号 学富五车 → 万人迷");
    expect(svg).toContain("距「万人迷」还差");
    expect(svg).toContain("已获 3 枚称号");
    expect(svg).toContain("近7天 +123");
    expect(svg).toContain("近30天 +456");
  });

  it("用户可控文本全部转义", () => {
    const svg = memberOgSvg({ ...base, displayName: '<img src=x>&"' }, { climbs: 0, logo });
    expect(svg).toContain("&lt;img src=x&gt;&amp;&quot;");
    expect(svg).not.toContain("<img src=x>");
  });

  it("超宽昵称截断并追加省略号", () => {
    const svg = memberOgSvg({ ...base, displayName: "一二三四五六七八九十甲乙丙丁戊己庚辛壬癸" }, { climbs: 0, logo });
    expect(svg).toContain("…");
    expect(svg).not.toContain("一二三四五六七八九十甲乙丙丁戊己庚辛壬癸<");
  });

  it("无快照：大数位显示占位并注明首次采集排队中", () => {
    const svg = memberOgSvg({ ...base, latestFollowers: null }, { climbs: 0, logo });
    expect(svg).toContain("首次采集排队中");
    expect(svg).not.toContain(">粉丝<");
  });

  it("增长为零时不出现正号，负增长自带负号", () => {
    const svg = memberOgSvg({ ...base, growth7d: 0, growth30d: -5 }, { climbs: 0, logo });
    expect(svg).toContain("近7天 0");
    expect(svg).toContain("近30天 -5");
  });

  it("进度为 0 时填充宽度为 0", () => {
    const svg = memberOgSvg({ ...base, progressToNext: 0 }, { climbs: 0, logo });
    expect(svg).toContain('width="0.0" height="12" rx="6"');
  });
});

describe("siteOgSvg", () => {
  it("包含品牌与社群总量", () => {
    const svg = siteOgSvg({ totalFollowers: 1_200_000, memberCount: 42, tenKMembers: 7, growth30d: 8640 }, logo);
    expect(svg).toContain("KOSX 万粉影响力计划");
    expect(svg).toContain("1,200,000");
    expect(svg).toContain("社群总粉丝 · 42 位成员 · 7 位已达万粉");
    expect(svg).toContain("近30天 +8,640");
  });
});
