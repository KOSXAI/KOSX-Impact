import type { RosterFile } from "./roster";

export interface MemberStats {
  id: string;
  handle: string;
  displayName: string | null;
  goal: number;
  joinedAt: string;
  /** X 公开头像 URL（来自最近一次采集），无头像为 null */
  profileImage: string | null;
  baselineFollowers: number | null;
  latestFollowers: number | null;
  latestRecordedAt: string | null;
  /** 相对加入时基线的增长（无基线时取 0） */
  growth: number;
  /** 相对基线的进度百分比（0-100，超过 100 封顶） */
  progress: number;
  /** 连续有快照的天数（含最新一天） */
  streakDays: number;
  /** 最近 7 天（含最新一天）的粉丝增长 */
  growth7d: number;
  /** 最近 30 天（含最新一天）的粉丝增长 */
  growth30d: number;
  /** 最近一次采集距今天数（null 表示从未采集） */
  daysSinceUpdate: number | null;
  /** 是否已达成个人目标（latestFollowers >= goal） */
  achieved: boolean;
  /** 达成目标后超出目标的部分（未达成时为 0） */
  overflow: number;
}

/** 预聚合字段（来自 daily_stats）：直传绕过窗口重算 */
export interface PresetStats {
  growth: number;
  growth7d: number;
  growth30d: number;
  progress: number;
  streakDays: number;
  achieved: boolean;
  overflow: number;
}

export interface DashboardStats {
  totalFollowers: number;
  totalGrowth: number;
  totalMilestones: number;
  members: MemberStats[];
  recentMilestones: Array<{
    memberId: string;
    handle: string;
    displayName: string | null;
    threshold: number;
    achievedAt: string;
  }>;
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

/** 计算连续有快照的天数：从最新一天往回数，中间断档即停止 */
export function computeStreakDays(dates: string[]): number {
  if (dates.length === 0) return 0;
  const days = [...new Set(dates.map((d) => d.slice(0, 10)))].sort();
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (daysBetween(days[i - 1], days[i]) === 1) streak++;
    else break;
  }
  return streak;
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
    goal: number;
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
  const progress = latest ? Math.min(100, Math.round((growth / member.goal) * 100)) : 0;

  return {
    id: member.id,
    handle: member.handle,
    displayName: member.displayName,
    goal: member.goal,
    joinedAt: member.joinedAt,
    profileImage: member.profileImage ?? null,
    baselineFollowers: baseline,
    latestFollowers: latest?.followers ?? null,
    latestRecordedAt: latest?.recordedAt ?? null,
    growth,
    progress,
    streakDays: computeStreakDays(snapshots.map((s) => s.recordedAt)),
    growth7d: computeGrowthNDays(snapshots, 7),
    growth30d: computeGrowthNDays(snapshots, 30),
    daysSinceUpdate: latest ? daysBetween(latest.recordedAt, now) : null,
    achieved: (latest?.followers ?? 0) >= member.goal,
    overflow: latest && latest.followers > member.goal ? latest.followers - member.goal : 0,
  };
}

export function computeDashboardStats(
  roster: RosterFile,
  rows: Array<{
    id: string;
    handle: string;
    displayName: string | null;
    goal: number;
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
        goal: row.goal,
        joinedAt: row.joinedAt,
        profileImage: row.profileImage,
      },
      row.snapshots,
      now,
      rosterMember?.baselineFollowers
    );
    // 预聚合覆盖：growth/趋势/连胜等来自采集时算好的 daily_stats，
    // followers/recordedAt 仍用窗口值（滚动采集下 daily_stats 可能滞后）
    return row.preset
      ? {
          ...computed,
          growth: row.preset.growth,
          growth7d: row.preset.growth7d,
          growth30d: row.preset.growth30d,
          progress: row.preset.progress,
          streakDays: row.preset.streakDays,
          achieved: row.preset.achieved,
          overflow: row.preset.overflow,
        }
      : computed;
  });

  const totalFollowers = members.reduce((sum, m) => sum + (m.latestFollowers ?? 0), 0);
  const totalGrowth = members.reduce((sum, m) => sum + m.growth, 0);
  const recentMilestones = [...milestones]
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, 10);

  // 冲刺榜按「和自己比」的进步排序：进度百分比优先，其次近期增长——不是绝对粉丝量
  members.sort((a, b) => b.progress - a.progress || b.growth30d - a.growth30d || b.growth - a.growth);

  return {
    totalFollowers,
    totalGrowth,
    totalMilestones: milestones.length,
    members,
    recentMilestones,
  };
}
