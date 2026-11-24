import { describe, expect, it } from "vitest";
import { renderMemberCard, renderNotFoundCard, renderSiteOgCard } from "../src/card";
import type { MemberStats } from "../src/stats";

function mockMember(over: Partial<MemberStats> = {}): MemberStats {
  return {
    id: "alice",
    handle: "alice_x",
    displayName: "Alice <Dev>",
    joinedAt: "2026-08-01",
    profileImage: null,
    baselineFollowers: 1000,
    latestFollowers: 12500,
    latestRecordedAt: "2026-09-10T00:00:00Z",
    growth: 11500,
    growth7d: 700,
    growth30d: 3000,
    daysSinceUpdate: 0,
    tierKey: "tenk",
    tierName: "万粉达人",
    prevMilestone: 10000,
    nextMilestone: 20000,
    progressToNext: 25,
    climbs: 5,
    tracks: ["AI工具", "开发者", "出海"],
    tags: [],
    ...over,
  };
}

describe("SVG 进度卡片（card.ts）", () => {
  it("track 变体多赛道胶囊横坐标严格递增且不重叠", () => {
    const svg = renderMemberCard(mockMember(), {
      variant: "track",
      trackRanks: [{ track: "AI工具", rank: 2, total: 30 }],
    });
    const rects = [...svg.matchAll(/<rect x="(\d+)" y="112" width="(\d+)"/g)].map((m) => ({
      x: Number(m[1]),
      w: Number(m[2]),
    }));
    expect(rects).toHaveLength(3);
    expect(rects[0].x).toBe(32);
    expect(rects[1].x).toBeGreaterThanOrEqual(rects[0].x + rects[0].w);
    expect(rects[2].x).toBeGreaterThanOrEqual(rects[1].x + rects[1].w);
    expect(svg).toContain("第 2 名 / 30 人");
  });

  it("对昵称与 id 做严格 XML 转义，避免 SVG 注入", () => {
    const svg = renderMemberCard(mockMember({ displayName: `A<script>"&'B` }));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("A&lt;script&gt;&quot;&amp;&#39;B");

    const nf = renderNotFoundCard(`<evil>`);
    expect(nf).not.toContain("<evil>");
    expect(nf).toContain("&lt;evil&gt;");
  });

  it("站点 OG SVG 包含总粉丝数与成员数", () => {
    const svg = renderSiteOgCard(841764, 119);
    expect(svg).toContain("841,764");
    expect(svg).toContain("119 位成员被追踪");
  });
});
