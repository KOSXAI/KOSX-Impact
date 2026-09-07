/**
 * 成员内容周报（动态计算，不落存储表）：近 7 天滚动窗口数据合成，
 * 与全站 7 天口径一致（数据每天一采，窗口终点 = 最近一次快照）。
 * 周报页 /reports/:memberId 直接在 SSR loader 里组装，零额外 API。
 */
import type { PostItem, WeeklyReport } from "./stats";
import type { MemberStats } from "./stats";
import { titleOf } from "./milestones";
import { detectInactive, detectViral, medianEngagement } from "./insights";

/** 帖子行（queries 层 posts30d 结构：PostMetric + 展示所需字段） */
export type ReportPost = Parameters<typeof medianEngagement>[0][number] & {
  tweetId: string;
  text: string | null;
};

export interface WeeklyReportInput {
  member: MemberStats;
  snapshots: Array<{ followers: number; recordedAt: string }>;
  milestones: Array<{ threshold: number; achievedAt: string }>;
  posts30d: ReportPost[];
  handle: string;
  tracks: string[];
  tags: string[];
  now: string;
}

const toPostItem = (p: ReportPost, handle: string): PostItem => ({
  tweetId: p.tweetId,
  createdAt: p.createdAt,
  text: p.text,
  views: p.views,
  likes: p.likes,
  replies: p.replies,
  retweets: p.retweets,
  quotes: p.quotes,
  bookmarks: p.bookmarks,
  url: `https://x.com/${encodeURIComponent(handle)}/status/${p.tweetId}`,
});

export function computeWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const { member, snapshots, milestones, posts30d, handle, tracks, tags, now } = input;
  const latest = snapshots[snapshots.length - 1] ?? null;
  const windowEnd = latest?.recordedAt ?? now;
  const windowStart = latest
    ? new Date(Date.parse(windowEnd) - 6 * 86_400_000).toISOString()
    : new Date(Date.parse(now) - 6 * 86_400_000).toISOString();

  // 窗口起点粉丝量：窗口内最早快照（不足则整个历史起点），与 growth7d 口径一致
  const firstInWindow = latest ? snapshots.find((s) => s.recordedAt >= windowStart) : null;
  const followersStart = latest ? (firstInWindow?.followers ?? snapshots[0]?.followers ?? 0) : 0;
  const followersEnd = latest?.followers ?? 0;
  const growth = followersEnd - followersStart;
  const growthPct = growth === 0 ? 0 : followersStart > 0 ? growth / Math.max(followersStart, 100) : null;

  // 窗口内登阶（最近一条）
  const windowStartMs = Date.parse(windowStart);
  let milestoneAchieved: WeeklyReport["milestoneAchieved"] = null;
  for (const ms of [...milestones].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))) {
    if (Date.parse(ms.achievedAt) >= windowStartMs) {
      milestoneAchieved = ms;
      break;
    }
  }

  // 窗口内帖子（created_at >= windowStart；posts30d 已是近 30 天窗口）
  const inWindow = posts30d.filter((p) => p.createdAt >= windowStart);
  const viewKey = (p: ReportPost) =>
    p.views ?? (p.likes ?? 0) + (p.replies ?? 0) + (p.retweets ?? 0) + (p.quotes ?? 0);
  const topPosts = [...inWindow].sort((a, b) => viewKey(b) - viewKey(a)).slice(0, 3);

  const inactive = detectInactive(posts30d, now);

  return {
    memberId: member.id,
    handle,
    displayName: member.displayName,
    profileImage: member.profileImage,
    tracks,
    tags,
    windowStart,
    windowEnd,
    followersStart,
    followersEnd,
    growth,
    growthPct,
    prevMilestone: member.prevMilestone,
    nextMilestone: member.nextMilestone,
    progressToNext: member.progressToNext,
    milestoneAchieved,
    postCount: inWindow.length,
    engagementMedian: medianEngagement(inWindow),
    topPosts: topPosts.map((p) => toPostItem(p, handle)),
    virals: detectViral(inWindow).map((v) => toPostItem(v, handle)),
    inactive: inactive.inactive,
    inactiveDays: inactive.days,
  };
}

/** 周报分享文案（分享按钮 / 卡片文案用） */
export function weeklyShareText(r: WeeklyReport): string {
  const name = r.displayName ?? `@${r.handle}`;
  const bits = [
    `${name}｜KOSX 万粉影响力计划 · 近7天`,
    `粉丝 ${r.followersStart.toLocaleString("zh-CN")} → ${r.followersEnd.toLocaleString("zh-CN")}（+${r.growth.toLocaleString("zh-CN")}）`,
    r.milestoneAchieved
      ? `🏅 拿下「${titleOf(r.milestoneAchieved.threshold)}」大关`
      : `距离「${titleOf(r.nextMilestone)}」还差 ${Math.max(0, r.nextMilestone - r.followersEnd)} 粉`,
  ];
  if (r.postCount > 0) bits.push(`近7天发了 ${r.postCount} 条内容`);
  return bits.join(" · ");
}