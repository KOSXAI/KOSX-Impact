import type { RosterFile } from "./roster";
import { nextThreshold, prevThreshold, progressToNext, tierOf, TEN_K, MILESTONE_THRESHOLDS } from "./milestones";
import type { Influence } from "./influence";
import type { MemberInsights } from "./insights";

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
  /** 上一道大关的门槛（已持有其称号；新人村为 0） */
  prevMilestone: number;
  /** 下一道大关的门槛（下一个称号） */
  nextMilestone: number;
  /** 距下一道大关的完成度（0-100） */
  progressToNext: number;
  /** 已拿下的大关数（成就徽章数，看板聚合时按登阶事件计） */
  climbs: number;
  /** 赛道数组（5 正式 + 综合；Grok 分类产物，空数组=未分类） */
  tracks: string[];
  /** 描述性标签数组（自由组合，空数组=未打标） */
  tags: string[];
  /** X 公开档案慢变量（members 表最新值；成员广场迷你名片卡用，成员详情页以 profile 为准） */
  bio?: string | null;
  bannerUrl?: string | null;
  verified?: boolean;
  /** 影响力指数（queries 层用近 30 天帖子计算后覆盖；纯函数层为 undefined） */
  influence?: Influence;
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

/** 品牌声量提及（站外「KOSX / impact.kosx.ai / 万粉影响力计划」的 X 提及，Grok 定时搜索入库） */
export interface MentionItem {
  keyword: string;
  authorHandle: string;
  authorName: string | null;
  text: string;
  url: string | null;
  sentiment: string | null;
  collectedAt: string;
}

/** 社群内容洞察（queries 层填充） */
export interface CommunityInsights {
  /** 全社群近 30 天爆款帖（浏览 ≥5000 且 ≥ 本人均值×2，按浏览降序） */
  viralPosts: PostItem[];
  /** 疑似停更成员（近 14 天无新帖，按停更天数降序） */
  inactiveMembers: Array<{
    memberId: string;
    handle: string;
    displayName: string | null;
    days: number;
  }>;
  /** 话题标签云：成员 tags 全社群聚合（计数降序） */
  tagCloud: Array<{ tag: string; count: number }>;
}

/** 赛道能量统计（queries 层填充：赛道区块与赛道页共用） */
export interface TrackStats {
  name: string;
  slug: string;
  memberCount: number;
  totalFollowers: number;
  growth30dTotal: number;
  /** 赛道内近 30 天单帖浏览 Top（帖子互动榜数据源） */
  topPosts: PostItem[];
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
  /** 全社群单帖浏览 Top N（queries 层填充） */
  topPosts: PostItem[];
  /** 社群内容洞察：爆款帖 / 停更成员 / 话题标签云（queries 层填充） */
  insights: CommunityInsights;
  /** 品牌声量：最近站外提及（queries 层填充） */
  mentions: MentionItem[];
  /** 赛道能量统计（queries 层填充，5 正式赛道 + 综合兜底） */
  trackStats: TrackStats[];
}

/** 粉丝圈画像（SocialData followers 采样聚合，fan_profiles 表） */
export interface FanProfile {
  sampledAt: string;
  sampleSize: number;
  avgFollowers: number;
  /** 千粉以上粉丝占比（0-100） */
  pctFollowers1k: number;
  /** 万粉以上粉丝占比（KOL，0-100） */
  pctFollowers10k: number;
  /** 认证账号占比（0-100） */
  verifiedPct: number;
  avgFriends: number;
  avgTweets: number;
  /** 账号平均年龄（天） */
  avgAgeDays: number;
  /** 样本内粉丝量 Top 20 KOL */
  topHandles: Array<{ handle: string; name: string | null; followers: number }>;
}

/** 相似账号推荐（Grok 逐个扫描产出，similar_accounts 表） */
export interface SimilarAccount {
  handle: string;
  name: string | null;
  avatar: string | null;
  /** 相似理由（Grok 判断） */
  reason: string;
  /** 与本人的主要差异 */
  difference: string | null;
  createdAt: string;
}

/** 成员内容周报（动态计算：近 7 天滚动窗口，与全站 7 天口径一致） */
export interface WeeklyReport {
  memberId: string;
  handle: string;
  displayName: string | null;
  profileImage: string | null;
  tracks: string[];
  tags: string[];
  /** 近 7 天窗口 */
  windowStart: string;
  windowEnd: string;
  followersStart: number;
  followersEnd: number;
  growth: number;
  /** 相对增长率（0-1；起点粉丝过小时为 null） */
  growthPct: number | null;
  /** 当前称号进度（与成员页一致） */
  prevMilestone: number;
  nextMilestone: number;
  progressToNext: number;
  /** 窗口内目标大关与达成时间（Grok 无责，纯数据） */
  milestoneAchieved: { threshold: number; achievedAt: string } | null;
  /** 窗口内发帖数 */
  postCount: number;
  /** 窗口内互动率中位数 */
  engagementMedian: number | null;
  /** 窗口内单帖互动 Top（浏览优先） */
  topPosts: PostItem[];
  /** 窗口内爆款帖 */
  virals: PostItem[];
  /** 近 14 天无新帖 */
  inactive: boolean;
  inactiveDays: number | null;
}

export interface MemberDetail {
  member: MemberStats;
  /** 档案资料（members 表最新值，SocialData 同一响应收集，零额外 API） */
  profile: MemberProfile;
  /** 次级计数（快照最新值 + 近 30 天增量；快照无值时为 null） */
  counters: MemberCounters;
  snapshots: Array<{ followers: number; recordedAt: string }>;
  milestones: Array<{ threshold: number; achievedAt: string }>;
  /** 帖子活跃度（近 20 帖互动数据；尚未采集到时为 null） */
  postActivity: PostActivity | null;
  /** 近 30 天帖子（周报 / 内容洞察计算用；无帖子数据为空数组） */
  posts30d: PostItem[];
  /** 影响力指数（近 30 天帖子计算；无粉丝数据为 null） */
  influence: Influence | null;
  /** 内容洞察：发帖数 / 互动率中位数 / 爆款（含原文链接）/ 停更（无帖子数据为 null） */
  insights: MemberInsights<PostItem> | null;
  /** 粉丝圈画像（尚未采样为 null） */
  fanProfile: FanProfile | null;
  /** 相似账号推荐（排序稳定，按扫描时间） */
  similarAccounts: SimilarAccount[];
}

/** 单帖活跃度数据（浏览/赞/评论等互动数 + 内容摘要） */
export interface PostItem {
  tweetId: string;
  /** 发帖时间（ISO） */
  createdAt: string;
  /** 帖子正文（展示层只出摘要，不外链全文） */
  text: string | null;
  views: number | null;
  likes: number | null;
  replies: number | null;
  retweets: number | null;
  quotes: number | null;
  bookmarks: number | null;
  /** 原文外链（x.com/{handle}/status/{tweetId}） */
  url: string;
  /** 成员展示信息（看板 topPosts 用；成员页内嵌区块可不带） */
  member?: { id: string; handle: string; displayName: string | null; profileImage: string | null };
}

/** 成员帖子活跃度汇总（queries 层从 posts 表窗口聚合） */
export interface PostActivity {
  /** 近 20 帖 */
  posts: PostItem[];
  totalViews: number;
  totalLikes: number;
  totalReplies: number;
}

/** 档案资料（慢变量，members 表最新值） */
export interface MemberProfile {
  bio: string | null;
  location: string | null;
  url: string | null;
  bannerUrl: string | null;
  /** X 账号创建时间（ISO）——「X 龄」 */
  xCreatedAt: string | null;
  verified: boolean;
}

/** 次级计数（快变量，取自最新快照） */
export interface MemberCounters {
  following: number | null;
  posts: number | null;
  /** 被列表收录数 */
  listedCount: number | null;
  /** 该账号发出的点赞数 */
  favouritesCount: number | null;
  /** 各计数的近 30 天增量（快照两端任一缺值则为 null） */
  delta30d: {
    following: number | null;
    posts: number | null;
    listedCount: number | null;
    favouritesCount: number | null;
  };
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
    const merged = row.preset
      ? {
          ...computed,
          growth: row.preset.growth,
          growth7d: row.preset.growth7d,
          growth30d: row.preset.growth30d,
        }
      : computed;
    // 赛道/标签透传：computeMemberStats 里是空数组，queries 层提供的真实值覆盖
    if (row.tracks) merged.tracks = row.tracks;
    if (row.tags) merged.tags = row.tags;
    // 档案慢变量透传：computeMemberStats 不含这些字段，迷你名片卡数据源
    if (row.bio !== undefined) merged.bio = row.bio;
    if (row.bannerUrl !== undefined) merged.bannerUrl = row.bannerUrl;
    if (row.verified !== undefined) merged.verified = row.verified === 1;
    return merged;
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
