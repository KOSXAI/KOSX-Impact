/**
 * 统计计算层：快照 → 成员统计 / 看板统计。类型定义在 stats.types.ts（此处再导出，
 * 全站引用保持 `import type { ... } from "@/stats"` 不变）。
 */
import type { RosterFile } from "./roster";
import { nextThreshold, prevThreshold, progressToNext, tierOf, TEN_K, MILESTONE_THRESHOLDS } from "./milestones";
import type { MemberStats, TrendPoint, DashboardStats } from "./stats.types";

export * from "./stats.types";

/** 计算两个 ISO 日期之间的整天数（b - a，按 UTC 日历日） */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.floor(ms / 86_400_000);
}

/** 计算最近 n 天（含最新一天）的粉丝增长；快照不足时按已有数据计算 */
export function computeGrowthNDays(
  snapshots: Array<{ followers: number; recordedAt: string }>,
  n: number
): number {
  if (snapshots.length === 0) return 0;
  const latest = snapshots[snapshots.length - 1];
  const cutoff = new Date(Date.parse(latest.recordedAt) - (n - 1) * 86_400_000).toISOString();
  const first = snapshots.find((s) => s.recordedAt >= cutoff);
  return latest.followers - (first?.followers ?? snapshots[0].followers);
}

/**
 * 次级计数（关注/发帖/列表收录/点赞）的近 n 天增量。
 * 与粉丝增长不同：列是后加的，历史快照可能缺值——窗口内最早的有值快照为基线，
 * 窗口内没值时回退全史最早；只有最新一个数据点时不显示增量（返回 null）。
 */
export function computeCountDelta(
  snapshots: Array<{ recordedAt: string } & { [key: string]: string | number | null | undefined }>,
  n: number,
  field: string
): number | null {
  if (snapshots.length === 0) return null;
  const last = snapshots.length - 1;
  const latestVal = snapshots[last][field];
  if (typeof latestVal !== "number") return null;
  const cutoff = new Date(Date.parse(snapshots[last].recordedAt) - (n - 1) * 86_400_000).toISOString();
  let baseIdx = -1;
  for (let i = 0; i <= last; i++) {
    if (snapshots[i].recordedAt >= cutoff) {
      const v = snapshots[i][field];
      if (typeof v === "number") {
        baseIdx = i;
        break;
      }
    }
  }
  if (baseIdx === -1) {
    for (let i = 0; i <= last; i++) {
      const v = snapshots[i][field];
      if (typeof v === "number") {
        baseIdx = i;
        break;
      }
    }
  }
  if (baseIdx === -1 || baseIdx === last) return null;
  const base = snapshots[baseIdx][field];
  return typeof base === "number" ? latestVal - base : null;
}

export function computeMemberStats(
  member: {
    id: string;
    handle: string;
    displayName: string | null;
    joinedAt: string;
    profileImage?: string | null;
  },
  snapshots: Array<{ followers: number; recordedAt: string }>,
  now: string,
  baselineFollowers?: number | null
): MemberStats {
  const latest = snapshots[snapshots.length - 1] ?? null;
  const baseline = baselineFollowers ?? snapshots[0]?.followers ?? null;
  const growth = latest ? latest.followers - (baseline ?? 0) : 0;
  const followers = latest?.followers ?? 0;
  const tier = tierOf(followers);

  return {
    id: member.id,
    handle: member.handle,
    displayName: member.displayName,
    joinedAt: member.joinedAt,
    profileImage: member.profileImage ?? null,
    baselineFollowers: baseline,
    latestFollowers: latest?.followers ?? null,
    latestRecordedAt: latest?.recordedAt ?? null,
    growth,
    growth7d: computeGrowthNDays(snapshots, 7),
    growth30d: computeGrowthNDays(snapshots, 30),
    daysSinceUpdate: latest ? daysBetween(latest.recordedAt, now) : null,
    tierKey: tier.key,
    tierName: tier.name,
    prevMilestone: prevThreshold(followers),
    nextMilestone: nextThreshold(followers),
    progressToNext: progressToNext(followers),
    climbs: 0,
    tracks: [],
    tags: [],
  };
}

export function computeDashboardStats(
  roster: RosterFile,
  rows: Array<{
    id: string;
    handle: string;
    displayName: string | null;
    joinedAt: string;
    profileImage?: string | null;
    snapshots: Array<{ followers: number; recordedAt: string }>;
    /** 赛道/标签（queries 层从 members 表 JSON parse 后传入，无则空数组） */
    tracks?: string[];
    tags?: string[];
    /** 档案慢变量（queries 层从 members 表传入，成员广场名片卡用） */
    bio?: string | null;
    bannerUrl?: string | null;
    verified?: number | null;
    /** 采集失败态（queries 层标定：无快照且队列最近一次为 failed） */
    collectFailed?: boolean;
  }>,
  milestones: Array<{
    memberId: string;
    handle: string;
    displayName: string | null;
    threshold: number;
    achievedAt: string;
  }>,
  now: string
): DashboardStats {
  const byId = new Map(roster.members.map((m) => [m.id, m]));
  const members = rows.map((row) => {
    const rosterMember = byId.get(row.id);
    const computed = computeMemberStats(
      {
        id: row.id,
        handle: row.handle,
        displayName: row.displayName,
        joinedAt: row.joinedAt,
        profileImage: row.profileImage,
      },
      row.snapshots,
      now,
      rosterMember?.baselineFollowers
    );
    // 赛道/标签透传：computeMemberStats 里是空数组，queries 层提供的真实值覆盖
    if (row.tracks) computed.tracks = row.tracks;
    if (row.tags) computed.tags = row.tags;
    // 档案慢变量透传：computeMemberStats 不含这些字段，迷你名片卡数据源
    if (row.bio !== undefined) computed.bio = row.bio;
    if (row.bannerUrl !== undefined) computed.bannerUrl = row.bannerUrl;
    if (row.verified !== undefined) computed.verified = row.verified === 1;
    if (row.collectFailed) computed.collectFailed = true;
    return computed;
  });

  // 登阶记录只认证号大关上的档位（旧阶梯档位不再展示）
  const ladderSet = new Set(MILESTONE_THRESHOLDS);
  const ladderMilestones = milestones.filter((m) => ladderSet.has(m.threshold));

  // 成就数按登阶事件计数，挂到每个成员上
  const climbCounts = new Map<string, number>();
  for (const m of ladderMilestones) {
    climbCounts.set(m.memberId, (climbCounts.get(m.memberId) ?? 0) + 1);
  }
  for (const m of members) m.climbs = climbCounts.get(m.id) ?? 0;

  const totalFollowers = members.reduce((sum, m) => sum + (m.latestFollowers ?? 0), 0);
  // 近 30 天新增按成员窗口增长求和；万粉成员按当前粉丝量判定，都不是自加入起的历史累计
  const totalGrowth30d = members.reduce((sum, m) => sum + m.growth30d, 0);
  const tenKMembers = members.filter((m) => (m.latestFollowers ?? 0) >= TEN_K).length;

  // 社群总粉丝趋势：每个快照日期取各成员「截至该日的最新粉丝量」求和。
  // 不用 daily_stats 按日合计——分片采集下当天的合计只含已采集成员，白天会出现假跌；
  // 本口径全天平滑、历史稳定。窗口受调用方快照窗口限制（当前 31 天）。
  // 注意从原始输入行取快照（members 映射后的 MemberStats 不携带 snapshots）。
  const trendDates = new Set<string>();
  for (const row of rows) for (const s of row.snapshots) trendDates.add(s.recordedAt.slice(0, 10));
  const trend: TrendPoint[] = [...trendDates].sort().map((date) => ({
    date,
    total: rows.reduce((sum, row) => {
      let latest = 0;
      for (const s of row.snapshots) {
        if (s.recordedAt.slice(0, 10) > date) break;
        latest = s.followers;
      }
      return sum + latest;
    }, 0),
  }));

  const recentMilestones = [...ladderMilestones]
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, 10);

  // 总排行按最新粉丝量从高到低；成长榜视角由前端按近期增长另行排序
  members.sort((a, b) => (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0));

  return {
    totalFollowers,
    totalGrowth30d,
    tenKMembers,
    members,
    recentMilestones,
    trend,
    topPosts: [],
    insights: { viralPosts: [], inactiveMembers: [], tagCloud: [] },
    mentions: [],
    trackStats: [],
  };
}
