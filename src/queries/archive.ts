/**
 * 归档与年度查询：getAnnualReport（/annual 年度影响力报告）与 getDailyArchive（/daily 社日归档）。
 * 套 cachedQuery 边缘缓存：年度报告 1h；日报按日期分键（历史日期不可变，同样 1h）。
 */
import { CACHE_KEYS, cachedQuery } from "../cache";
import type { PostItem } from "../stats";
import { TOP_POST_FIELDS, mapPostRow, type PostRow } from "./shared";

export interface AnnualReport {
  year: number;
  totalFollowers: number;
  memberCount: number;
  ytdGrowth: number;
  monthlyTrend: Array<{ month: string; total: number }>;
  topGrowers: Array<{ memberId: string; handle: string; displayName: string | null; profileImage: string | null; growth: number }>;
  topMentions: Array<{ memberId: string; handle: string; displayName: string | null; profileImage: string | null; count: number }>;
  topPosts: PostItem[];
  ytdClimbsList: Array<{ memberId: string; handle: string; displayName: string | null; profileImage: string | null; threshold: number; achievedAt: string }>;
  ytdClimbs: number;
}

/** 年度影响力报告（/annual 用）：本年至今的社群叙事——YTD 增长 / 月度总粉丝 / 年度登阶 / Top 涨粉与声量 / 年度最火内容 */
export async function getAnnualReport(env: Env): Promise<AnnualReport> {
  return cachedQuery(env, CACHE_KEYS.annualReport, 3600, () => buildAnnualReport(env));
}

async function buildAnnualReport(env: Env): Promise<AnnualReport> {
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();

  const { results: memberRows } = await env.DB.prepare(
    `SELECT m.id, m.handle, m.display_name AS displayName, m.profile_image AS profileImage,
            (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id ORDER BY s.recorded_at DESC LIMIT 1) AS latestFollowers,
            (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id AND s.recorded_at >= ?1 ORDER BY s.recorded_at LIMIT 1) AS firstYtdFollowers
     FROM members m WHERE m.status = 'active'`
  ).bind(yearStart).all();
  const members = memberRows as never as Array<{
    id: string; handle: string; displayName: string | null; profileImage: string | null;
    latestFollowers: number | null; firstYtdFollowers: number | null;
  }>;
  const totalFollowers = members.reduce((s, m) => s + (m.latestFollowers ?? 0), 0);
  const topGrowers = members
    .map((m) => ({
      memberId: m.id, handle: m.handle, displayName: m.displayName, profileImage: m.profileImage,
      growth: (m.latestFollowers ?? 0) - (m.firstYtdFollowers ?? 0),
    }))
    .filter((g) => g.growth > 0)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 5);
  const ytdGrowth = members.reduce((s, m) => s + Math.max(0, (m.latestFollowers ?? 0) - (m.firstYtdFollowers ?? 0)), 0);

  // 月度总粉丝趋势：取每月该成员最后一条快照加总
  const { results: snapRows } = await env.DB.prepare(
    `SELECT member_id AS memberId, substr(recorded_at, 1, 7) AS month, followers
     FROM snapshots WHERE recorded_at >= ?1 ORDER BY recorded_at`
  ).bind(yearStart).all();
  const monthLatest = new Map<string, Map<string, number>>();
  for (const r of snapRows as never as Array<{ memberId: string; month: string; followers: number }>) {
    const mm = monthLatest.get(r.month) ?? new Map();
    mm.set(r.memberId, r.followers);
    monthLatest.set(r.month, mm);
  }
  const monthlyTrend = [...monthLatest.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, byMember]) => ({ month, total: [...byMember.values()].reduce((s, v) => s + v, 0) }));

  const { results: climbRows } = await env.DB.prepare(
    `SELECT ms.member_id AS memberId, ms.threshold, ms.achieved_at AS achievedAt,
            m.handle, m.display_name AS displayName, m.profile_image AS profileImage
     FROM milestones ms JOIN members m ON m.id = ms.member_id
     WHERE ms.achieved_at >= ?1 AND m.status = 'active' ORDER BY ms.achieved_at DESC`
  ).bind(yearStart).all();
  const ytdClimbsList = (climbRows as never as Array<{
    memberId: string; handle: string; displayName: string | null; profileImage: string | null; threshold: number; achievedAt: string;
  }>).slice(0, 10);
  const ytdClimbs = climbRows.length;

  const { results: topPostRows } = await env.DB.prepare(
    `SELECT ${TOP_POST_FIELDS}
     FROM posts p JOIN members m ON m.id = p.member_id
     WHERE m.status = 'active' AND p.views_count IS NOT NULL
     ORDER BY p.views_count DESC LIMIT 6`
  ).all();
  const topPosts = (topPostRows as never as Array<
    PostRow & { memberId: string; handle: string; displayName: string | null; profileImage: string | null }
  >).map((r) => ({ ...mapPostRow(r, r.handle), member: { id: r.memberId, handle: r.handle, displayName: r.displayName, profileImage: r.profileImage } }));

  const { results: mentionRowsA } = await env.DB.prepare(
    `SELECT member_id AS memberId, COUNT(*) AS n FROM member_mentions
     WHERE mentioned_at >= ?1 GROUP BY member_id`
  ).bind(yearStart).all();
  const yearMentionCounts = new Map<string, number>();
  for (const r of mentionRowsA as never as Array<{ memberId: string; n: number }>) yearMentionCounts.set(r.memberId, r.n);
  const topMentions = members
    .map((m) => ({ memberId: m.id, handle: m.handle, displayName: m.displayName, profileImage: m.profileImage, count: yearMentionCounts.get(m.id) ?? 0 }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { year, totalFollowers, memberCount: members.length, ytdGrowth, monthlyTrend, topGrowers, topMentions, topPosts, ytdClimbsList, ytdClimbs };
}

export interface DailyArchiveReport {
  date: string;
  memberCount: number;
  totalFollowers: number;
  climbs: Array<{ memberId: string; handle: string; displayName: string | null; threshold: number; achievedAt: string }>;
  mentionsCount: number;
  newJoins: number;
}

/** 社日归档：指定统计日（YYYY-MM-DD）的社群快照——当日总粉丝 / 当日登阶 / 当日提及（/daily?date=） */
export async function getDailyArchive(env: Env, date: string): Promise<DailyArchiveReport> {
  return cachedQuery(env, CACHE_KEYS.dailyArchive(date), 3600, () => buildDailyArchive(env, date));
}

async function buildDailyArchive(env: Env, date: string): Promise<DailyArchiveReport> {
  const dayEnd = `${date}T23:59:59`;
  const { results: followerRows } = await env.DB.prepare(
    `SELECT s.member_id AS memberId, s.followers FROM snapshots s
     WHERE s.recorded_at <= ?1
       AND s.recorded_at = (SELECT MAX(s2.recorded_at) FROM snapshots s2
                            WHERE s2.member_id = s.member_id AND s2.recorded_at <= ?1)`
  ).bind(dayEnd).all();
  const rows = followerRows as never as Array<{ memberId: string; followers: number }>;
  const totalFollowers = rows.reduce((s, r) => s + r.followers, 0);

  const { results: climbRows } = await env.DB.prepare(
    `SELECT ms.member_id AS memberId, ms.threshold, ms.achieved_at AS achievedAt, m.handle, m.display_name AS displayName
     FROM milestones ms JOIN members m ON m.id = ms.member_id
     WHERE substr(ms.achieved_at, 1, 10) = ?1 AND m.status = 'active'
     ORDER BY ms.achieved_at DESC`
  ).bind(date).all();
  const climbs = climbRows as never as Array<{ memberId: string; handle: string; displayName: string | null; threshold: number; achievedAt: string }>;

  const mentionRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM mentions WHERE substr(collected_at, 1, 10) = ?1`
  ).bind(date).first();
  const memberRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM members WHERE status = 'active' AND substr(joined_at, 1, 10) = ?1`
  ).bind(date).first();

  return {
    date,
    memberCount: rows.length,
    totalFollowers,
    climbs,
    mentionsCount: ((mentionRow as never as { n?: number } | null)?.n ?? 0) as number,
    newJoins: ((memberRow as never as { n?: number } | null)?.n ?? 0) as number,
  };
}
