import type { RosterFile } from "./roster";
import { nextThreshold, prevThreshold, progressToNext, tierOf, TEN_K, UNIFORM_THRESHOLDS } from "./milestones";

export interface MemberStats {
  id: string;
  handle: string;
  displayName: string | null;
  joinedAt: string;
  /** X 公开头像 URL（来自最近一次采集），无头像为 null */
  profileImage: string | null;
  baselineFollowers: number | null;
  latestFollowers: number | null;
  latestRecordedAt: string | null;
  /** 相对加入时基线的增长（无基线时取 0） */
  growth: number;
  /** 最近 7 天（含最新一天）的粉丝增长 */
  growth7d: number;
  /** 最近 30 天（含最新一天）的粉丝增长 */
  growth30d: number;
  /** 最近一次采集距今天数（null 表示从未采集） */
  daysSinceUpdate: number | null;
  /** 段位（量级身份徽章） */
  tierKey: string;
  tierName: string;
  /** 当前台阶起点（低于首档时为 0） */
  prevTier: number;
  /** 下一级台阶（下一枚成就） */
  nextTier: number;
  /** 距下一级台阶的完成度（0-100） */
  progressToNext: number;
  /** 已登台阶数（成就徽章数，看板聚合时按登阶事件计） */
  climbs: number;
}

/** 预聚合字段（来自 daily_stats）：直传绕过窗口重算 */
export interface PresetStats {
  growth: number;
  growth7d: number;
  growth30d: number;
}

export interface TrendPoint {
  /** 统计日 YYYY-MM-DD */
  date: string;
  /** 当日全体成员粉丝量合计（daily_stats 按日聚合） */
  total: number;
}

export interface DashboardStats {
  totalFollowers: number;
  /** 近 30 天社群新增粉丝（各成员 growth30d 之和）：滚动窗口内统计，与账号加入时间无关 */
  totalGrowth30d: number;
  /** 已达成万粉的成员数（粉丝量 ≥ 10000 的当前状态快照） */
  tenKMembers: number;
  members: MemberStats[];
  recentMilestones: Array<{
    memberId: string;
    handle: string;
    displayName: string | null;
    threshold: number;
    achievedAt: string;
  }>;
  /** 社群总粉丝量按日趋势（daily_stats 聚合；纯函数层返回空数组，queries 层填充） */
  trend: TrendPoint[];
}

export interface MemberDetail {
  member: MemberStats;
  snapshots: Array<{ followers: number; recordedAt: string }>;
  milestones: Array<{ threshold: number; achievedAt: string }>;
}

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
    prevTier: prevThreshold(followers),
    nextTier: nextThreshold(followers),
    progressToNext: progressToNext(followers),
    climbs: 0,
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
    /** daily_stats 预聚合字段：有值时直接采用，不重算 */
    preset?: PresetStats;
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
    // 预聚合覆盖：growth/趋势来自采集时算好的 daily_stats，
    // followers/recordedAt 仍用窗口值（滚动采集下 daily_stats 可能滞后）
    return row.preset
      ? {
          ...computed,
          growth: row.preset.growth,
          growth7d: row.preset.growth7d,
          growth30d: row.preset.growth30d,
        }
      : computed;
  });

  // 登阶记录只认均匀成就阶梯上的档位（旧阶梯档位不再展示）
  const ladderSet = new Set(UNIFORM_THRESHOLDS);
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
  };
}
