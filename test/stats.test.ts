import { describe, expect, it } from "vitest";
import {
  computeDashboardStats,
  computeGrowthNDays,
  computeMemberStats,
  daysBetween,
} from "../src/stats";

const NOW = "2026-09-04T00:00:00Z";

describe("daysBetween", () => {
  it("按 UTC 日历日计算整天数", () => {
    expect(daysBetween("2026-09-01T00:00:00Z", "2026-09-04T00:00:00Z")).toBe(3);
    expect(daysBetween("2026-09-01T23:00:00Z", "2026-09-04T01:00:00Z")).toBe(2);
  });
});

describe("computeGrowthNDays", () => {
  const snapshots = [
    { followers: 100, recordedAt: "2026-08-01T00:00:00Z" },
    { followers: 120, recordedAt: "2026-08-20T00:00:00Z" },
    { followers: 150, recordedAt: "2026-09-01T00:00:00Z" },
    { followers: 160, recordedAt: "2026-09-03T00:00:00Z" },
  ];

  it("计算最近 n 天内的增长", () => {
    expect(computeGrowthNDays(snapshots, 7)).toBe(10);
    expect(computeGrowthNDays(snapshots, 30)).toBe(40);
  });

  it("窗口内快照不足时按已有数据计算", () => {
    expect(computeGrowthNDays(snapshots, 60)).toBe(60);
  });

  it("空列表返回 0", () => {
    expect(computeGrowthNDays([], 7)).toBe(0);
  });
});

describe("computeMemberStats", () => {
  const member = {
    id: "m1",
    handle: "alice",
    displayName: "Alice",
    joinedAt: "2026-08-01",
  };

  it("计算增长与最近趋势", () => {
    const snapshots = [
      { followers: 1000, recordedAt: "2026-09-01T00:00:00Z" },
      { followers: 1200, recordedAt: "2026-09-02T00:00:00Z" },
      { followers: 1500, recordedAt: "2026-09-03T00:00:00Z" },
    ];
    const stats = computeMemberStats(member, snapshots, NOW);
    expect(stats.latestFollowers).toBe(1500);
    expect(stats.baselineFollowers).toBe(1000);
    expect(stats.growth).toBe(500);
    expect(stats.daysSinceUpdate).toBe(1);
  });

  it("计算段位与下一级台阶", () => {
    const snapshots = [
      { followers: 1000, recordedAt: "2026-09-01T00:00:00Z" },
      { followers: 1200, recordedAt: "2026-09-02T00:00:00Z" },
      { followers: 1500, recordedAt: "2026-09-03T00:00:00Z" },
    ];
    const stats = computeMemberStats(member, snapshots, NOW);
    expect(stats.tierKey).toBe("thousand");
    expect(stats.tierName).toBe("千粉新秀");
    expect(stats.prevMilestone).toBe(1000);
    expect(stats.nextMilestone).toBe(5000);
    expect(stats.progressToNext).toBe(13); // (1500-1000)/(5000-1000)
    expect(stats.climbs).toBe(0);
  });

  it("无快照时各字段为空值", () => {
    const stats = computeMemberStats(member, [], NOW);
    expect(stats.latestFollowers).toBeNull();
    expect(stats.growth).toBe(0);
    expect(stats.daysSinceUpdate).toBeNull();
    expect(stats.tierKey).toBe("seed");
    expect(stats.nextMilestone).toBe(100);
    expect(stats.progressToNext).toBe(0);
  });
});

describe("computeDashboardStats", () => {
  const roster = {
    members: [
      { id: "m1", handle: "alice", displayName: "Alice", joinedAt: "2026-08-01", baselineFollowers: 1000 },
      { id: "m2", handle: "bob", joinedAt: "2026-08-02" },
    ],
  };

  it("汇总社群总量与总排行（按粉丝量排序）", () => {
    const rows = [
      {
        id: "m1",
        handle: "alice",
        displayName: "Alice",
        joinedAt: "2026-08-01",
        snapshots: [
          { followers: 1000, recordedAt: "2026-08-21T00:00:00Z" },
          { followers: 1500, recordedAt: "2026-09-03T00:00:00Z" },
        ],
      },
      { id: "m2", handle: "bob", displayName: null, joinedAt: "2026-08-02", snapshots: [] },
    ];
    const milestones = [
      { memberId: "m1", handle: "alice", displayName: "Alice", threshold: 1000, achievedAt: "2026-09-02T00:00:00Z" },
    ];
    const stats = computeDashboardStats(roster, rows as never, milestones, NOW);
    expect(stats.totalFollowers).toBe(1500);
    expect(stats.totalGrowth30d).toBe(500);
    expect(stats.tenKMembers).toBe(0);
    expect(stats.members).toHaveLength(2);
    expect(stats.members[0].latestFollowers).toBe(1500);
    expect(stats.members[1].latestFollowers).toBeNull();
    expect(stats.members[0].climbs).toBe(1);
    expect(stats.members[1].climbs).toBe(0);
    expect(stats.recentMilestones[0].handle).toBe("alice");
    // 社群趋势：每个快照日取各成员「截至该日最新粉丝量」求和；未追踪成员不贡献
    expect(stats.trend).toEqual([
      { date: "2026-08-21", total: 1000 },
      { date: "2026-09-03", total: 1500 },
    ]);
  });

  it("最近登阶按时间倒序且最多 10 条，旧阶梯档位被过滤", () => {
    const rows = [] as never;
    const ladder = [100, 500, 1000, 5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 60000];
    const milestones = [
      ...ladder.map((threshold, i) => ({
        memberId: "m1",
        handle: "alice",
        displayName: null,
        threshold,
        achievedAt: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })),
      // 非阶梯档位不再展示（旧阶梯档位）
      { memberId: "m2", handle: "bob", displayName: null, threshold: 1250, achievedAt: "2026-09-20T00:00:00Z" },
      { memberId: "m2", handle: "bob", displayName: null, threshold: 3300, achievedAt: "2026-09-21T00:00:00Z" },
    ];
    const stats = computeDashboardStats(roster, rows, milestones, NOW);
    expect(stats.recentMilestones).toHaveLength(10);
    expect(stats.recentMilestones[0].achievedAt).toBe("2026-09-12T00:00:00Z");
    expect(stats.recentMilestones.every((m) => m.threshold !== 1250 && m.threshold !== 3300)).toBe(true);
  });

  it("统计近 30 天社群新增与万粉成员数", () => {
    const rows = [
      {
        id: "m1",
        handle: "alice",
        displayName: null,
        joinedAt: "2026-08-01",
        snapshots: [
          { followers: 1000, recordedAt: "2026-08-10T00:00:00Z" },
          { followers: 10500, recordedAt: "2026-09-03T00:00:00Z" },
        ],
      },
      {
        id: "m2",
        handle: "bob",
        displayName: null,
        joinedAt: "2026-08-02",
        snapshots: [
          { followers: 50, recordedAt: "2026-08-20T00:00:00Z" },
          { followers: 60, recordedAt: "2026-09-03T00:00:00Z" },
        ],
      },
    ];
    const stats = computeDashboardStats(roster, rows as never, [], NOW);
    expect(stats.totalGrowth30d).toBe(9510);
    expect(stats.tenKMembers).toBe(1);
    expect(stats.totalFollowers).toBe(10560);
  });
});
