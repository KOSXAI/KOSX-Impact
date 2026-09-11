/**
 * 统计层类型定义（纯类型，零运行时）。
 * 计算函数在 stats.ts；引用方一律从 "@/stats" import（stats.ts 再导出），本文件不直接被外部引用。
 */
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
  /** 从未有快照且最近一次自队采集以失败告终（查无账号/持续报错）；用于与「排队中」区分的失败态 */
  collectFailed?: boolean;
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
  /** 赛道数组（5 正式 + 综合；空数组=未分类） */
  tracks: string[];
  /** 描述性标签数组（自由组合，空数组=未打标） */
  tags: string[];
  /** X 公开档案慢变量（members 表最新值；成员广场迷你名片卡用，成员详情页以 profile 为准） */
  bio?: string | null;
  bannerUrl?: string | null;
  verified?: boolean;
  /** 影响力指数（queries 层用近 30 天帖子计算后覆盖；纯函数层为 undefined） */
  influence?: Influence;
  /** 近 30 天发帖数（queries 层从 posts 表填充；无帖子数据为 0） */
  posts30d?: number;
  /** 近 7 天发帖数（queries 层填充，勤快榜用） */
  posts7d?: number;
  /** 近 30 天帖子总浏览（queries 层填充） */
  views30d?: number;
  /** 帖均曝光 = views30d / posts30d（queries 层填充；无帖子为 null，新锐榜用） */
  avgViewsPerPost?: number | null;
  /** 帖均曝光相对同量级粉丝段的中位倍数（queries 层填充；样本不足为 null） */
  efficiencyVsMedian?: number | null;
  /** 帖子互动率中位数（queries 层填充，0-1；无帖子为 null） */
  engagementMedian?: number | null;
  /** 近 30 天被提及次数（member_mentions 表，queries 层填充；被提及榜数据源） */
  mentionCount30d?: number;
  /** 今日曝光增量：近 24h 内刷新过的帖子 views 相比上次抓取的增量合计（queries 层填充） */
  viewsTodayGain?: number;
  /** 今日粉丝增量（最近一天快照差值，queries 层填充，多维时间榜用） */
  growth1d?: number;
  /** 名次环比：昨日快照排名 − 今日快照排名，正数=上升（queries 层填充；昨日无快照为 null） */
  rankDelta?: number | null;
  /** 近 7 天帖子总浏览（queries 层填充） */
  views7d?: number;
  /** 今日发帖数 / 今日评论总数（queries 层填充，多维时间榜用） */
  postsToday?: number;
  repliesToday?: number;
  /** 近 7 / 30 天评论总数（queries 层填充） */
  replies7d?: number;
  replies30d?: number;
}

export interface TrendPoint {
  /** 统计日 YYYY-MM-DD */
  date: string;
  /** 当日全体成员粉丝量合计（每成员截至该日最新快照加总） */
  total: number;
}

/** 品牌声量提及（站外「KOSX / impact.kosx.ai / 万粉影响力计划」的 X 提及，定时搜索入库） */
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
  /** 社群总粉丝量按日趋势（快照窗口推导，不用 daily_stats 按日合计） */
  trend: TrendPoint[];
  /** 全社群单帖浏览 Top N（queries 层填充） */
  topPosts: PostItem[];
  /** 社群内容洞察：爆款帖 / 停更成员 / 话题标签云（queries 层填充） */
  insights: CommunityInsights;
  /** 品牌声量：最近站外提及（queries 层填充） */
  mentions: MentionItem[];
  /** 品牌声量趋势：最近 14 天按日计数（queries 层填充，首页迷你图） */
  mentionsTrend?: Array<{ date: string; count: number }>;
  /** 社群互推图谱：近 30 天帖子正文 @到其他成员的边（queries 层填充，首页网络区块） */
  mutualEdges?: Array<{ from: string; to: string; count: number }>;
  /** 赛道能量统计（queries 层填充，5 正式赛道 + 综合兜底） */
  trackStats: TrackStats[];
  /** 成员话题统计：成员 tags 聚合出的话题行（queries 层填充，首页话题窗格） */
  topicStats?: Array<{
    tag: string;
    /** 挂该话题的成员数 */
    memberCount: number;
    /** 这些成员近 30 天帖子总浏览 */
    views30d: number;
    /** 这些成员近 30 天粉丝净增 */
    growth30d: number;
  }>;
  /** 今日爆帖：近 24h 里 views 相比上次抓取增量最大的帖子（queries 层填充，正在发生的口径） */
  trendingPosts?: PostItem[];
  /** 社群内部关注网：成员成员互相关注对（follows 表，sync-follows 低频采集；queries 层填充） */
  followNet?: { mutualPairs: number; trackedMembers: number };
  /** 粉丝画像总览：fan_profiles 全成员样本聚合（queries 层填充，大屏质量 chip） */
  fansSample?: {
    sampledAt: string;
    sampleSize: number;
    avgFollowers: number | null;
    /** 万粉（KOL）粉丝占比 0-100 */
    pct10k: number | null;
    /** 认证账号占比 0-100 */
    verifiedPct: number | null;
  };
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

/** 相似账号推荐（similar_accounts 表） */
export interface SimilarAccount {
  handle: string;
  name: string | null;
  avatar: string | null;
  /** 相似理由 */
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
  /** 窗口内目标大关与达成时间 */
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
  /** 赛道邻居：本成员在各赛道内的名次 + 同赛道成员（queries 层填充，引流/SEO 用） */
  neighbors?: {
    /** 每赛道内的名次（按粉丝量降序） */
    trackRanks: Array<{ track: string; rank: number; total: number }>;
    /** 同赛道其他成员（按粉丝量降序，最多 8 位，不含本人） */
    members: Array<{ id: string; handle: string; displayName: string | null; profileImage: string | null; followers: number | null }>;
  };
  /** 同粉丝圈：粉丝样本重叠度最高的其他成员（fan_profiles 采样重叠，queries 层填充） */
  fanCircle?: Array<{
    id: string;
    handle: string;
    displayName: string | null;
    profileImage: string | null;
    followers: number | null;
    overlap: number;
  }>;
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
  /** 相邻两次抓取的浏览增量（views − views_prev，今日爆帖数据源；queries 层填充） */
  viewsGain?: number | null;
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

