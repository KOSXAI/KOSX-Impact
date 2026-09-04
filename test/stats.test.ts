import { describe, expect, it } from "vitest";
import {
  computeDashboardStats,
  computeGrowthNDays,
  computeMemberStats,
  computeStreakDays,
  daysBetween,
} from "../src/stats";

const NOW = "2026-09-04T00:00:00Z";

describe("daysBetween", () => {
  it("按 UTC 日历日计算整天数", () => {
    expect(daysBetween("2026-09-01T00:00:00Z", "2026-09-04T00:00:00Z")).toBe(3);
    expect(daysBetween("2026-09-01T23:00:00Z", "2026-09-04T01:00:00Z")).toBe(2);
  });
});

describe("computeStreakDays", () => {
  it("连续快照计为连胜天数", () => {
    const dates = ["2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", "2026-09-03T00:00:00Z"];
    expect(computeStreakDays(dates)).toBe(3);
  });

  it("中间断档时只计最近一段", () => {
    const dates = ["2026-08-30T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"];
    expect(computeStreakDays(dates)).toBe(2);
  });

  it("同一天多条快照去重", () => {
    const dates = ["2026-09-01T00:00:00Z", "2026-09-01T12:00:00Z", "2026-09-02T00:00:00Z"];
    expect(computeStreakDays(dates)).toBe(2);
  });

  it("空列表返回 0", () => {
    expect(computeStreakDays([])).toBe(0);
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
    goal: 10000,
    joinedAt: "2026-08-01",
  };

  it("计算增长、进度与连胜", () => {
    const snapshots = [
      { followers: 1000, recordedAt: "2026-09-01T00:00:00Z" },
      { followers: 1200, recordedAt: "2026-09-02T00:00:00Z" },
      { followers: 1500, recordedAt: "2026-09-03T00:00:00Z" },
    ];
    const stats = computeMemberStats(member, snapshots, NOW);
    expect(stats.latestFollowers).toBe(1500);
    expect(stats.baselineFollowers).toBe(1000);
    expect(stats.growth).toBe(500);
    expect(stats.progress).toBe(5);
    expect(stats.streakDays).toBe(3);
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
    expect(stats.prevTier).toBe(1500);
    expect(stats.nextTier).toBe(2000);
    expect(stats.progressToNext).toBe(0);
  });

  it("无快照时各字段为空值", () => {
    const stats = computeMemberStats(member, [], NOW);
    expect(stats.latestFollowers).toBeNull();
    expect(stats.growth).toBe(0);
    expect(stats.progress).toBe(0);
    expect(stats.streakDays).toBe(0);
    expect(stats.daysSinceUpdate).toBeNull();
    expect(stats.tierKey).toBe("seed");
    expect(stats.nextTier).toBe(100);
    expect(stats.progressToNext).toBe(0);
  });

  it("进度超过目标时封顶 100", () => {
    const snapshots = [
      { followers: 100, recordedAt: "2026-09-01T00:00:00Z" },
      { followers: 20000, recordedAt: "2026-09-02T00:00:00Z" },
    ];
    expect(computeMemberStats(member, snapshots, NOW).progress).toBe(100);
  });
});

describe("computeDashboardStats", () => {
  const roster = {
    members: [
      { id: "m1", handle: "alice", displayName: "Alice", goal: 10000, joinedAt: "2026-08-01", baselineFollowers: 1000 },
      { id: "m2", handle: "bob", goal: 10000, joinedAt: "2026-08-02" },
    ],
  };

  it("汇总社群总量与增长榜", () => {
    const rows = [
      {
        id: "m1",
        handle: "alice",
        displayName: "Alice",
        goal: 10000,
        joinedAt: "2026-08-01",
        snapshots: [
          { followers: 1000, recordedAt: "2026-08-21T00:00:00Z" },
          { followers: 1500, recordedAt: "2026-09-03T00:00:00Z" },
        ],
      },
      { id: "m2", handle: "bob", displayName: null, goal: 10000, joinedAt: "2026-08-02", snapshots: [] },
    ];
    const milestones = [
      { memberId: "m1", handle: "alice", displayName: "Alice", threshold: 1000, achievedAt: "2026-09-02T00:00:00Z" },
    ];
    const stats = computeDashboardStats(roster, rows as never, milestones, NOW);
    expect(stats.totalFollowers).toBe(1500);
    expect(stats.totalGrowth).toBe(500);
    expect(stats.totalMilestones).toBe(1);
    expect(stats.members).toHaveLength(2);
    expect(stats.members[0].latestFollowers).toBe(1500);
    expect(stats.members[1].latestFollowers).toBeNull();
    expect(stats.recentMilestones[0].handle).toBe("alice");
  });

  it("最近登阶按时间倒序且最多 10 条，旧阶梯档位被过滤", () => {
    const rows = [] as never;
    const ladder = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000];
    const milestones = [
      ...ladder.map((threshold, i) => ({
        memberId: "m1",
        handle: "alice",
        displayName: null,
        threshold,
        achievedAt: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })),
      // 非阶梯档位不再展示（旧阶梯 2500/7500 恰好也是 500 的倍数，仍在新阶梯上）
      { memberId: "m2", handle: "bob", displayName: null, threshold: 1250, achievedAt: "2026-09-20T00:00:00Z" },
      { memberId: "m2", handle: "bob", displayName: null, threshold: 3300, achievedAt: "2026-09-21T00:00:00Z" },
    ];
    const stats = computeDashboardStats(roster, rows, milestones, NOW);
    expect(stats.recentMilestones).toHaveLength(10);
    expect(stats.recentMilestones[0].achievedAt).toBe("2026-09-12T00:00:00Z");
    expect(stats.totalMilestones).toBe(12);
    expect(stats.recentMilestones.every((m) => m.threshold !== 1250 && m.threshold !== 3300)).toBe(true);
  });
});
