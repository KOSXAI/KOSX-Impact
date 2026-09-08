/**
 * 共享查询层：Hono API 路由与 TanStack Start SSR（server functions）都从这里取数。
 * 复用同一批 Cache API 缓存键（按绝对 URL），SSR 与 API 端点共享边缘缓存，
 * 不因前端迁移增加 D1 行读取。缓存键带 cache_bust 数据版本：
 * 采集/提交写库后版本 +1，新键在各区必然 miss → 数据变化后刷新立即可见。
 */
import type { DashboardStats, MemberDetail, PostItem, MentionItem, TrackStats, FanProfile, SimilarAccount } from "./stats";
import { computeDashboardStats, computeMemberStats, computeCountDelta, computeGrowthNDays } from "./stats";
import { computeInfluence } from "./influence";
import { computeMemberInsights, detectViral, type PostMetric } from "./insights";
import { MILESTONE_THRESHOLDS, titleOf } from "./milestones";
import { TRACKS, TRACK_OTHER } from "./tracks";
import { roster } from "./roster";
import { CACHE_KEYS, cachedResponse, readCacheBust } from "./cache";
import { SITE_URL } from "./lib/site";

// Env 由 worker-configuration.d.ts / env.d.ts 全局声明（无单独模块）

// 含档案慢变量（bio/banner/verified）：看板 members payload 直接携带，成员广场迷你名片卡零额外查询
const MEMBER_FIELDS = `id, handle, display_name AS displayName, joined_at AS joinedAt, profile_image AS profileImage, tracks, tags, verified, bio, banner_url AS bannerUrl`;
const SNAPSHOT_FIELDS = `member_id AS memberId, followers, recorded_at AS recordedAt`;
const POST_FIELDS = `tweet_id AS tweetId, created_at AS createdAt, text,
  views_count AS views, views_prev AS viewsPrev, recorded_at AS postRecordedAt,
  like_count AS likes, reply_count AS replies,
  retweet_count AS retweets, quote_count AS quotes, bookmark_count AS bookmarks`;

type MemberRow = {
  id: string;
  handle: string;
  displayName: string | null;
  joinedAt: string;
  profileImage: string | null;
  tracks: string | null;
  tags: string | null;
  verified: number | null;
  bio: string | null;
  bannerUrl: string | null;
};
type SnapshotRow = { memberId: string; followers: number; recordedAt: string; listedCount?: number | null };
type PostRow = {
  tweetId: string;
  createdAt: string;
  text: string | null;
  views: number | null;
  viewsPrev: number | null;
  postRecordedAt: string;
  likes: number | null;
  replies: number | null;
  retweets: number | null;
  quotes: number | null;
  bookmarks: number | null;
};

/** members 表的 tracks/tags（JSON 文本，可能为 NULL）→ 数组；解析失败回退空数组 */
function parseStrArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 任意 JSON 数组解析（对象数组等）：解析失败或非数组回退空数组 */
function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** 中位数（数值数组，空数组返回 0） */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** posts 表行 → PostItem（拼 x.com 原文外链） */
function mapPostRow(row: PostRow, handle: string): PostItem {
  return {
    tweetId: row.tweetId,
    createdAt: row.createdAt,
    text: row.text,
    views: row.views,
    likes: row.likes,
    replies: row.replies,
    retweets: row.retweets,
    quotes: row.quotes,
    bookmarks: row.bookmarks,
    url: `https://x.com/${encodeURIComponent(handle)}/status/${row.tweetId}`,
  };
}

/** 成员近 N 帖 + 互动合计（返回 null 表示该成员尚无帖子数据） */
async function getPostActivity(env: Env, memberId: string, handle: string, limit = 20): Promise<MemberDetail["postActivity"]> {
  const { results: rows } = await env.DB.prepare(
    `SELECT ${POST_FIELDS} FROM posts WHERE member_id = ?1 ORDER BY created_at DESC LIMIT ?2`
  ).bind(memberId, limit).all();
  const posts = (rows as never as PostRow[]).map((r) => mapPostRow(r, handle));
  if (posts.length === 0) return null;
  const totals = posts.reduce(
    (acc, p) => ({
      totalViews: acc.totalViews + (p.views ?? 0),
      totalLikes: acc.totalLikes + (p.likes ?? 0),
      totalReplies: acc.totalReplies + (p.replies ?? 0),
    }),
    { totalViews: 0, totalLikes: 0, totalReplies: 0 }
  );
  return { posts, ...totals };
}

/** 精华帖：近 N 天全社群单帖浏览 Top（posts 表 + members 联查，带成员展示信息）。走 /api/top-posts 缓存键 */
export async function getTopPosts(
  env: Env,
  opts: { days?: number; limit?: number } = {}
): Promise<PostItem[]> {
  const { days = 30, limit = 20 } = opts;
  const bust = await readCacheBust(env);
  const res = await cachedResponse(
    new Request(`${SITE_URL}${CACHE_KEYS.topPosts}&days=${days}&cb=${bust}`),
    3600,
    async () => {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      // views 缺失时用 赞+评论+转推 估算排序（COALESCE 兜底），避免高互动帖被筛掉
      const { results: rows } = await env.DB.prepare(
        `SELECT p.tweet_id AS tweetId, p.created_at AS createdAt, p.text,
                p.views_count AS views, p.like_count AS likes, p.reply_count AS replies,
                p.retweet_count AS retweets, p.quote_count AS quotes, p.bookmark_count AS bookmarks,
                m.id AS memberId, m.handle, m.display_name AS displayName, m.profile_image AS profileImage
         FROM posts p
         JOIN members m ON m.id = p.member_id
         WHERE m.status = 'active' AND p.created_at >= ?1
         ORDER BY COALESCE(p.views_count, p.like_count + p.reply_count + p.retweet_count) DESC LIMIT ?2`
      ).bind(cutoff, limit).all();
      const posts = (rows as never as Array<PostRow & {
        memberId: string;
        handle: string;
        displayName: string | null;
        profileImage: string | null;
      }>).map((r) => ({
        ...mapPostRow(r, r.handle),
        member: { id: r.memberId, handle: r.handle, displayName: r.displayName, profileImage: r.profileImage },
      }));
      return new Response(JSON.stringify({ posts, days, cutoff }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  );
  const body = (await res.json()) as { posts: PostItem[] };
  return body.posts;
}

/** 看板统计（/api/dashboard 与首页 SSR 共用，缓存键 ${SITE_URL}/api/dashboard&cb=数据版本） */
export async function getDashboardStats(env: Env): Promise<DashboardStats> {
  const bust = await readCacheBust(env);
  const res = await cachedResponse(
    new Request(`${SITE_URL}${CACHE_KEYS.dashboard}&cb=${bust}`),
    3600,
    async () => {
    const now = new Date().toISOString();
    const { results: memberRows } = await env.DB.prepare(
      `SELECT ${MEMBER_FIELDS} FROM members WHERE status = 'active' ORDER BY joined_at`
    ).all();
    const memberList = memberRows as never as MemberRow[];
    // 每成员最近 31 条快照（窗口查询，走 idx_snapshots_member_date，行读取恒定）
    const snapshotStmt = env.DB.prepare(
      "SELECT member_id AS memberId, followers, listed_count AS listedCount, recorded_at AS recordedAt FROM snapshots WHERE member_id = ?1 ORDER BY recorded_at DESC LIMIT 31"
    );
    const snapshotBatches = await env.DB.batch(memberList.map((m) => snapshotStmt.bind(m.id)));

    const { results: milestoneRows } = await env.DB.prepare(
      `SELECT ms.member_id AS memberId, m.handle, m.display_name AS displayName, ms.threshold, ms.achieved_at AS achievedAt
       FROM milestones ms
       JOIN members m ON m.id = ms.member_id
       WHERE m.status = 'active'`
    ).all();

    // 全社群单帖浏览 Top 8（posts 表 + members 联查，带成员展示信息）
    const { results: topPostRows } = await env.DB.prepare(
      `SELECT p.tweet_id AS tweetId, p.created_at AS createdAt, p.text,
              p.views_count AS views, p.like_count AS likes, p.reply_count AS replies,
              p.retweet_count AS retweets, p.quote_count AS quotes, p.bookmark_count AS bookmarks,
              m.id AS memberId, m.handle, m.display_name AS displayName, m.profile_image AS profileImage
       FROM posts p
       JOIN members m ON m.id = p.member_id
       WHERE m.status = 'active' AND p.views_count IS NOT NULL
       ORDER BY p.views_count DESC LIMIT 8`
    ).all();
    const topPosts: PostItem[] = (topPostRows as never as Array<PostRow & {
      memberId: string;
      handle: string;
      displayName: string | null;
      profileImage: string | null;
    }>).map((r) => ({
      ...mapPostRow(r, r.handle),
      member: { id: r.memberId, handle: r.handle, displayName: r.displayName, profileImage: r.profileImage },
    }));

    // 近 30 天全社群帖子：影响力指数 / 内容洞察 / 赛道互动榜的数据源（单次窗口查询）
    const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { results: post30dRows } = await env.DB.prepare(
      `SELECT member_id AS memberId, ${POST_FIELDS}
       FROM posts WHERE created_at >= ?1`
    ).bind(cutoff30d).all();
    const postsByMember = new Map<string, PostRow[]>();
    for (const r of post30dRows as never as Array<PostRow & { memberId: string }>) {
      const list = postsByMember.get(r.memberId) ?? [];
      list.push({ tweetId: r.tweetId, createdAt: r.createdAt, text: r.text, views: r.views, viewsPrev: r.viewsPrev, postRecordedAt: r.postRecordedAt, likes: r.likes, replies: r.replies, retweets: r.retweets, quotes: r.quotes, bookmarks: r.bookmarks });
      postsByMember.set(r.memberId, list);
    }

    // 品牌声量：最近 20 条站外提及
    const { results: mentionRows } = await env.DB.prepare(
      `SELECT keyword, author_handle AS authorHandle, author_name AS authorName, text,
              tweet_url AS url, sentiment, collected_at AS collectedAt
       FROM mentions ORDER BY collected_at DESC LIMIT 20`
    ).all();
    const mentions: MentionItem[] = mentionRows as never as MentionItem[];

    // 成员被提及热度：member_mentions 近 30 天按成员计数（被提及榜数据源）
    const mentionCounts = new Map<string, number>();
    {
      const cutoffMention = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { results: mmRows } = await env.DB.prepare(
        `SELECT member_id AS memberId, COUNT(*) AS n FROM member_mentions
         WHERE mentioned_at >= ?1 GROUP BY member_id`
      ).bind(cutoffMention).all();
      for (const r of mmRows as never as Array<{ memberId: string; n: number }>) {
        mentionCounts.set(r.memberId, r.n);
      }
    }

    // 品牌声量趋势：最近 14 天按日计数（首页声量卡迷你图）
    const mentionsTrend: Array<{ date: string; count: number }> = [];
    {
      // collected_at 为「YYYY-MM-DD HH:MM:SS」空格分隔，先取前 10 位再比较，避免 T 分隔的 ISO 串字典序错位
      const cutoffMentionT = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const { results: mtRows } = await env.DB.prepare(
        `SELECT substr(collected_at, 1, 10) AS d, COUNT(*) AS n FROM mentions
         WHERE substr(collected_at, 1, 10) >= ?1 GROUP BY d ORDER BY d`
      ).bind(cutoffMentionT).all();
      for (const r of mtRows as never as Array<{ d: string; n: number }>) {
        mentionsTrend.push({ date: r.d, count: r.n });
      }
    }

    const memberStats = memberList.map((m, i) => {
      const rows = (snapshotBatches[i]?.results ?? []) as never as SnapshotRow[];
      // 窗口内是倒序取的，统计层期望正序
      const snapshots = rows.slice().reverse();
      // 赛道/标签：members 表 JSON 文本 → 数组（挂到 stats.members 供 computeDashboardStats 透传）
      return { ...m, snapshots, tracks: parseStrArray(m.tracks), tags: parseStrArray(m.tags) };
    });

    // 与 API JSON 响应同构：computeDashboardStats 输出即 DashboardStats（trend 由快照窗口推导）
    const stats = computeDashboardStats(roster, memberStats, milestoneRows as never, now);
    // 帖子互动 Top：纯函数层返回空数组，这里用真实查询覆盖
    stats.topPosts = topPosts;
    stats.mentions = mentions;
    stats.mentionsTrend = mentionsTrend;

    // 影响力指数：近 30 天帖子 + 最新快照列表收录数 + verified（逐成员）
    const rowById = new Map(memberStats.map((m) => [m.id, m]));
    const cutoff7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const cutoffToday = new Date().toISOString().slice(0, 10);
    for (const ms of stats.members) {
      const row = rowById.get(ms.id)!;
      const latestSnap = row.snapshots[row.snapshots.length - 1] ?? null;
      ms.influence = computeInfluence({
        followers: ms.latestFollowers ?? 0,
        growth30d: ms.growth30d,
        verified: row.verified === 1,
        listedCount: latestSnap?.listedCount ?? null,
        posts30d: postsByMember.get(ms.id) ?? [],
      });

      // 帖子内容指标：发帖量 / 总浏览 / 帖均曝光 / 互动率中位数（新锐榜 · 勤快榜 · 黄金时段数据源）
      const posts = postsByMember.get(ms.id) ?? [];
      const views30d = posts.reduce((s, p) => s + (p.views ?? 0), 0);
      ms.posts30d = posts.length;
      ms.posts7d = posts.filter((p) => p.createdAt >= cutoff7d).length;
      ms.views30d = views30d;
      ms.avgViewsPerPost = posts.length ? views30d / posts.length : null;
      ms.growth1d = computeGrowthNDays(row.snapshots, 1);
      ms.views7d = posts.filter((p) => p.createdAt >= cutoff7d).reduce((s, p) => s + (p.views ?? 0), 0);
      ms.postsToday = posts.filter((p) => p.createdAt.slice(0, 10) === cutoffToday).length;
      ms.repliesToday = posts.filter((p) => p.createdAt.slice(0, 10) === cutoffToday).reduce((s, p) => s + (p.replies ?? 0), 0);
      ms.replies7d = posts.filter((p) => p.createdAt >= cutoff7d).reduce((s, p) => s + (p.replies ?? 0), 0);
      ms.replies30d = posts.reduce((s, p) => s + (p.replies ?? 0), 0);
      const rates: number[] = [];
      for (const p of posts) {
        const eng = (p.likes ?? 0) + (p.replies ?? 0) + (p.retweets ?? 0) + (p.quotes ?? 0) + (p.bookmarks ?? 0);
        if (p.views && p.views > 0) rates.push(eng / p.views);
      }
      ms.engagementMedian = rates.length ? median(rates) : null;
      ms.mentionCount30d = mentionCounts.get(ms.id) ?? 0;
      // 今日曝光增量：近 24h 内刷新过、且 views 相比上次抓取上涨的帖子增量合计
      const refreshSince = new Date(Date.now() - 26 * 3600_000).toISOString();
      ms.viewsTodayGain = posts
        .filter((p) => p.postRecordedAt >= refreshSince && p.views != null && p.viewsPrev != null && p.views > p.viewsPrev)
        .reduce((s, p) => s + ((p.views ?? 0) - (p.viewsPrev ?? 0)), 0);
    }

    // 社群互推图谱：近 30 天帖子正文里 @到其他成员的边（转推/引用/提及，排除本人自提）
    {
      const handleToId = new Map<string, string>();
      for (const m of memberStats) handleToId.set(m.handle.toLowerCase(), m.id);
      const regexCache = new Map<string, RegExp>();
      const edgeMap = new Map<string, number>();
      for (const [fromId, posts] of postsByMember) {
        for (const p of posts) {
          if (!p.text) continue;
          const text = p.text.toLowerCase();
          for (const [handle, toId] of handleToId) {
            if (toId === fromId) continue;
            let re = regexCache.get(handle);
            if (!re) {
              re = new RegExp(`@${handle}(?![\\w])`);
              regexCache.set(handle, re);
            }
            if (re.test(text)) {
              const key = `${fromId}\u0000${toId}`;
              edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
            }
          }
        }
      }
      const mutualEdges = [...edgeMap.entries()]
        .map(([key, count]) => {
          const [from, to] = key.split("\u0000");
          return { from, to, count };
        })
        .sort((a, b) => b.count - a.count);
      stats.mutualEdges = mutualEdges.slice(0, 12);
    }

    // 帖均曝光 vs 同量级粉丝段中位：先按粉丝段分桶算中位，再逐成员给倍数（样本不足该段不产出）
    {
      const buckets = [
        { label: "1k-5k", min: 1000, max: 5000 },
        { label: "5k-10k", min: 5000, max: 10000 },
        { label: "10k-50k", min: 10000, max: 50000 },
        { label: "50k-100k", min: 50000, max: 100000 },
        { label: "100k+", min: 100000, max: Infinity },
      ];
      const bucketMedian = new Map<string, number>();
      for (const b of buckets) {
        const vals = stats.members
          .filter((m) => {
            const f = m.latestFollowers ?? 0;
            return f >= b.min && f < b.max && m.avgViewsPerPost != null;
          })
          .map((m) => m.avgViewsPerPost!);
        if (vals.length >= 3) bucketMedian.set(b.label, median(vals));
      }
      for (const ms of stats.members) {
        if (ms.avgViewsPerPost == null) continue;
        const f = ms.latestFollowers ?? 0;
        const b = buckets.find((x) => f >= x.min && f < x.max);
        const med = b ? bucketMedian.get(b.label) : undefined;
        ms.efficiencyVsMedian = med && med > 0 ? ms.avgViewsPerPost / med : null;
      }
    }

    // 社群内容洞察：爆款帖汇总（浏览降序 Top8）+ 停更名单（天数降序）+ 话题标签云
    const viralPosts: PostItem[] = [];
    const inactiveMembers: DashboardStats["insights"]["inactiveMembers"] = [];
    for (const ms of stats.members) {
      const posts = postsByMember.get(ms.id) ?? [];
      const ins = computeMemberInsights(posts, now);
      const member = { id: ms.id, handle: ms.handle, displayName: ms.displayName, profileImage: ms.profileImage };
      for (const v of detectViral(posts)) {
        viralPosts.push({ ...mapPostRow(v as PostRow, ms.handle), member });
      }
      if (ins.inactive && typeof ins.inactiveDays === "number") {
        inactiveMembers.push({ memberId: ms.id, handle: ms.handle, displayName: ms.displayName, days: ins.inactiveDays });
      }
    }
    viralPosts.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    inactiveMembers.sort((a, b) => b.days - a.days);
    const tagCounts = new Map<string, number>();
    for (const m of memberStats) for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const tagCloud = [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    stats.insights = { viralPosts: viralPosts.slice(0, 8), inactiveMembers, tagCloud };

    // 赛道能量统计：成员规模 / 总粉丝 / 30 天增长 / 赛道内互动 Top3（帖子互动榜数据源）
    const trackStats: TrackStats[] = [...TRACKS, TRACK_OTHER].map((t) => {
      const members = stats.members.filter((m) => m.tracks.includes(t.name));
      const posts: PostItem[] = [];
      for (const m of members) {
        for (const p of postsByMember.get(m.id) ?? []) {
          posts.push({
            ...mapPostRow(p, m.handle),
            member: { id: m.id, handle: m.handle, displayName: m.displayName, profileImage: m.profileImage },
          });
        }
      }
      const viewKey = (p: PostItem) => p.views ?? (p.likes ?? 0) + (p.replies ?? 0) + (p.retweets ?? 0);
      return {
        name: t.name,
        slug: t.slug,
        memberCount: members.length,
        totalFollowers: members.reduce((s, m) => s + (m.latestFollowers ?? 0), 0),
        growth30dTotal: members.reduce((s, m) => s + m.growth30d, 0),
        topPosts: posts.sort((a, b) => viewKey(b) - viewKey(a)).slice(0, 3),
      };
    });
    stats.trackStats = trackStats;

    return new Response(JSON.stringify(stats), {
      headers: { "Content-Type": "application/json" },
    });
  });
  return (await res.json()) as DashboardStats;
}

/** 社群信号（共同关注 / 社群热议）：三级页面「内容」的社群品味策展数据源 */
export async function getCommunitySignals(env: Env): Promise<Array<{ kind: string; handle: string; name: string | null; count: number }>> {
  const { results } = await env.DB.prepare(
    `SELECT kind, handle, name, count FROM community_signal_counts
     ORDER BY kind, count DESC`
  ).all();
  return results as never as Array<{ kind: string; handle: string; name: string | null; count: number }>;
}

/** 粉丝质量聚合（社群能量报告 /report 用）：fan_profiles 全量样本指标 */
export async function getFanOverview(env: Env): Promise<Array<{ memberId: string; sampleSize: number; pctFollowers10k: number; verifiedPct: number }>> {
  const { results } = await env.DB.prepare(
    `SELECT member_id AS memberId, sample_size AS sampleSize,
            pct_followers_10k AS pctFollowers10k, verified_pct AS verifiedPct
     FROM fan_profiles`
  ).all();
  return results as never as Array<{ memberId: string; sampleSize: number; pctFollowers10k: number; verifiedPct: number }>;
}

/** 帖子互动顶部：互动率中位数 >0 的成员里取近 30 天强互动的成员（社群能量报告维度，轻量查询） */
export async function getTopEngagementMembers(env: Env): Promise<Array<{ memberId: string; n: number }>> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT member_id AS memberId, COUNT(*) AS n FROM posts
     WHERE created_at >= ?1 AND views_count >= 1000 GROUP BY member_id ORDER BY n DESC LIMIT 8`
  ).bind(cutoff).all();
  return results as never as Array<{ memberId: string; n: number }>;
}

/** 邀请裂变荣誉榜：谁带来了最多新成员（invite_events 聚合，queries 层；/report 展示） */
export async function getInviteLeaders(env: Env): Promise<Array<{ inviterId: string; n: number; handle: string; displayName: string | null; profileImage: string | null }>> {
  const { results } = await env.DB.prepare(
    `SELECT ie.inviter_id AS inviterId, COUNT(*) AS n, m.handle, m.display_name AS displayName, m.profile_image AS profileImage
     FROM invite_events ie JOIN members m ON m.id = ie.inviter_id
     WHERE m.status = 'active'
     GROUP BY ie.inviter_id ORDER BY n DESC LIMIT 8`
  ).all();
  return results as never as Array<{ inviterId: string; n: number; handle: string; displayName: string | null; profileImage: string | null }>;
}

/** 年度影响力报告（/annual 用）：本年至今的社群叙事——YTD 增长 / 月度总粉丝 / 年度登阶 / Top 涨粉与声量 / 年度最火内容 */
export async function getAnnualReport(env: Env): Promise<{
  year: number;
  totalFollowers: number;
  memberCount: number;
  ytdGrowth: number;
  monthlyTrend: Array<{ month: string; total: number }>;
  topGrowers: Array<{ memberId: string; handle: string; displayName: string | null; profileImage: string | null; growth: number }>;
  topMentions: Array<{ memberId: string; handle: string; displayName: string | null; profileImage: string | null; count: number }>;
  topPosts: PostItem[];
  ytdClimbsList: Array<{ memberId: string; handle: string; displayName: string | null; threshold: number; achievedAt: string }>;
  ytdClimbs: number;
}> {
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
            m.handle, m.display_name AS displayName
     FROM milestones ms JOIN members m ON m.id = ms.member_id
     WHERE ms.achieved_at >= ?1 AND m.status = 'active' ORDER BY ms.achieved_at DESC`
  ).bind(yearStart).all();
  const ytdClimbsList = (climbRows as never as Array<{
    memberId: string; handle: string; displayName: string | null; threshold: number; achievedAt: string;
  }>).slice(0, 10);
  const ytdClimbs = climbRows.length;

  const { results: topPostRows } = await env.DB.prepare(
    `SELECT p.tweet_id AS tweetId, p.created_at AS createdAt, p.text,
            p.views_count AS views, p.like_count AS likes, p.reply_count AS replies,
            p.retweet_count AS retweets, p.quote_count AS quotes, p.bookmark_count AS bookmarks,
            m.id AS memberId, m.handle, m.display_name AS displayName, m.profile_image AS profileImage
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

/** 社日归档：指定统计日（YYYY-MM-DD）的社群快照——当日总粉丝 / 当日登阶 / 当日提及（/daily?date=） */
export async function getDailyArchive(env: Env, date: string) {
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

/** 成员详情（/api/members/:id 与成员页 SSR 共用，缓存键 ${SITE_URL}/api/members/:id&cb=数据版本） */
export async function getMemberDetail(env: Env, id: string): Promise<MemberDetail | null> {
  const bust = await readCacheBust(env);
  const res = await cachedResponse(
    new Request(`${SITE_URL}${CACHE_KEYS.memberDetail(id)}&cb=${bust}`),
    3600,
    async () => {
    const member = await env.DB.prepare(
      `SELECT ${MEMBER_FIELDS}, location, url, x_created_at AS xCreatedAt
       FROM members WHERE id = ? AND status = 'active'`
    ).bind(id).first();
    if (!member) return new Response(JSON.stringify({ error: "member not found" }), { status: 404 });

    const { results: snapshots } = await env.DB.prepare(
      `SELECT followers, following, posts, listed_count AS listedCount, favourites_count AS favouritesCount,
              recorded_at AS recordedAt
       FROM snapshots WHERE member_id = ? ORDER BY recorded_at`
    ).bind(id).all();
    const { results: milestones } = await env.DB.prepare(
      "SELECT threshold, achieved_at AS achievedAt FROM milestones WHERE member_id = ? ORDER BY threshold"
    ).bind(id).all();
    // 只展示称号大关上的档位（旧阶梯档位不再展示）
    const ladderSet = new Set(MILESTONE_THRESHOLDS);
    const ladderMilestones = (milestones as never as Array<{ threshold: number; achievedAt: string }>).filter(
      (r) => ladderSet.has(r.threshold)
    );

    const memberRow = member as never as {
      id: string;
      handle: string;
      displayName: string | null;
      joinedAt: string;
      profileImage: string | null;
      bio: string | null;
      location: string | null;
      url: string | null;
      bannerUrl: string | null;
      xCreatedAt: string | null;
      verified: number | null;
      tracks: string | null;
      tags: string | null;
    };

    // 帖子活跃度：近 20 帖 + 互动合计（posts 表，尚未采集到时为 null）
    const postActivity = await getPostActivity(env, memberRow.id, memberRow.handle);

    // 近 30 天帖子：影响力指数 + 内容洞察（爆款 / 停更 / 互动率中位数）
    const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { results: post30dRows } = await env.DB.prepare(
      `SELECT ${POST_FIELDS} FROM posts WHERE member_id = ?1 AND created_at >= ?2`
    ).bind(memberRow.id, cutoff30d).all();
    const posts30d = post30dRows as never as PostRow[];

    // 粉丝圈画像（尚未采样为 null）
    const fanRow = await env.DB.prepare(
      `SELECT sampled_at AS sampledAt, sample_size AS sampleSize, avg_followers AS avgFollowers,
              pct_followers_1k AS pctFollowers1k, pct_followers_10k AS pctFollowers10k,
              verified_pct AS verifiedPct, avg_friends AS avgFriends, avg_tweets AS avgTweets,
              avg_age_days AS avgAgeDays, top_handles AS topHandlesRaw
       FROM fan_profiles WHERE member_id = ?1`
    ).bind(memberRow.id).first();
    let fanProfile: FanProfile | null = null;
    if (fanRow) {
      const fr = fanRow as never as Omit<FanProfile, "topHandles"> & { topHandlesRaw: string | null };
      fanProfile = {
        sampledAt: fr.sampledAt,
        sampleSize: fr.sampleSize,
        avgFollowers: fr.avgFollowers,
        pctFollowers1k: fr.pctFollowers1k,
        pctFollowers10k: fr.pctFollowers10k,
        verifiedPct: fr.verifiedPct,
        avgFriends: fr.avgFriends,
        avgTweets: fr.avgTweets,
        avgAgeDays: fr.avgAgeDays,
        topHandles: parseJsonArray<FanProfile["topHandles"][number]>(fr.topHandlesRaw),
      };
    }

    // 相似账号推荐（Grok 扫描产出）
    const { results: similarRows2 } = await env.DB.prepare(
      `SELECT handle, name, avatar, reason, difference, created_at AS createdAt
       FROM similar_accounts WHERE member_id = ?1 ORDER BY created_at`
    ).bind(memberRow.id).all();
    const similarAccounts = similarRows2 as never as SimilarAccount[];

    // 赛道邻居：本成员在各赛道内的名次 + 同赛道其他成员（引流 / SEO 用，轻量单查询）
    const { results: neighborRows } = await env.DB.prepare(
      `SELECT m.id, m.handle, m.display_name AS displayName, m.profile_image AS profileImage, m.tracks,
              (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id ORDER BY s.recorded_at DESC LIMIT 1) AS followers
       FROM members m WHERE m.status = 'active'`
    ).all();
    const myTracks = parseStrArray(memberRow.tracks);
    const allNeighbors = (neighborRows as never as Array<{
      id: string; handle: string; displayName: string | null; profileImage: string | null; tracks: string | null; followers: number | null;
    }>).map((r) => ({ ...r, tracks: parseStrArray(r.tracks) }));
    const trackRanks = myTracks.map((track) => {
      const inTrack = allNeighbors
        .filter((n) => n.tracks.includes(track))
        .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
      const rank = inTrack.findIndex((n) => n.id === memberRow.id) + 1;
      return { track, rank, total: inTrack.length };
    });
    const neighbors = {
      trackRanks,
      members: allNeighbors
        .filter((n) => n.id !== memberRow.id && n.tracks.some((t) => myTracks.includes(t)))
        .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
        .slice(0, 8)
        .map((n) => ({ id: n.id, handle: n.handle, displayName: n.displayName, profileImage: n.profileImage, followers: n.followers })),
    };

    // 同粉丝圈：fan_profiles 粉丝样本重叠度最高的其他成员（采样重叠，方向性参考）
    let fanCircle: MemberDetail["fanCircle"] = undefined;
    if (fanProfile && fanProfile.topHandles.length > 0) {
      const myHandles = new Set(fanProfile.topHandles.map((h) => h.handle.toLowerCase()));
      const { results: fanCircleRows } = await env.DB.prepare(
        `SELECT m.id, m.handle, m.display_name AS displayName, m.profile_image AS profileImage,
                fp.top_handles AS topHandlesRaw,
                (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id ORDER BY s.recorded_at DESC LIMIT 1) AS followers
         FROM fan_profiles fp JOIN members m ON m.id = fp.member_id
         WHERE m.status = 'active' AND m.id != ?1`
      ).bind(memberRow.id).all();
      const candidates = (fanCircleRows as never as Array<{
        id: string; handle: string; displayName: string | null; profileImage: string | null; topHandlesRaw: string | null; followers: number | null;
      }>).map((r) => {
        const others = parseJsonArray<{ handle: string }>(r.topHandlesRaw)
          .map((h) => (h.handle ?? "").toLowerCase())
          .filter(Boolean);
        const overlap = others.filter((h) => myHandles.has(h)).length;
        return { id: r.id, handle: r.handle, displayName: r.displayName, profileImage: r.profileImage, followers: r.followers, overlap };
      });
      const maxOverlap = Math.max(0, ...candidates.map((c) => c.overlap));
      if (maxOverlap >= 2) {
        fanCircle = candidates
          .filter((c) => c.overlap >= Math.max(2, Math.floor(maxOverlap * 0.4)))
          .sort((a, b) => b.overlap - a.overlap || (b.followers ?? 0) - (a.followers ?? 0))
          .slice(0, 5);
      }
    }

    const snapshotRows = snapshots as never as Array<
      { recordedAt: string } & Record<string, number | null> & { followers: number }
    >;

    const stats = computeMemberStats(
      {
        id: memberRow.id,
        handle: memberRow.handle,
        displayName: memberRow.displayName,
        joinedAt: memberRow.joinedAt,
        profileImage: memberRow.profileImage,
      },
      snapshotRows,
      new Date().toISOString()
    );
    // 赛道/标签：computeMemberStats 里是空数组，用 members 表真实值覆盖
    stats.tracks = parseStrArray(memberRow.tracks);
    stats.tags = parseStrArray(memberRow.tags);

    // 次级计数：最新快照的当前值 + 近 30 天增量（历史快照缺值的字段不硬算）
    const latestSnap = snapshotRows[snapshotRows.length - 1] ?? null;
    const counters: MemberDetail["counters"] = {
      following: latestSnap?.following ?? null,
      posts: latestSnap?.posts ?? null,
      listedCount: latestSnap?.listedCount ?? null,
      favouritesCount: latestSnap?.favouritesCount ?? null,
      delta30d: {
        following: computeCountDelta(snapshotRows, 30, "following"),
        posts: computeCountDelta(snapshotRows, 30, "posts"),
        listedCount: computeCountDelta(snapshotRows, 30, "listedCount"),
        favouritesCount: computeCountDelta(snapshotRows, 30, "favouritesCount"),
      },
    };

    const detail: MemberDetail = {
      member: stats,
      profile: {
        bio: memberRow.bio,
        location: memberRow.location,
        url: memberRow.url,
        bannerUrl: memberRow.bannerUrl,
        xCreatedAt: memberRow.xCreatedAt,
        verified: memberRow.verified === 1,
      },
      counters,
      snapshots: snapshotRows,
      milestones: ladderMilestones,
      postActivity,
      posts30d: posts30d.map((p) => mapPostRow(p, memberRow.handle)),
      influence: computeInfluence({
        followers: stats.latestFollowers ?? 0,
        growth30d: stats.growth30d,
        verified: memberRow.verified === 1,
        listedCount: counters.listedCount,
        posts30d,
      }),
      insights: posts30d.length
        ? (() => {
            const ins = computeMemberInsights(posts30d, new Date().toISOString());
            // virals 补全原文外链（insights 纯函数只保留互动指标）
            return {
              ...ins,
              virals: ins.virals.map((v) => mapPostRow(v as PostRow, memberRow.handle)),
            };
          })()
        : null,
      fanProfile,
      similarAccounts,
      neighbors,
      fanCircle,
    };
    return new Response(JSON.stringify(detail), { headers: { "Content-Type": "application/json" } });
  });
  if (res.status === 404) return null;
  return (await res.json()) as MemberDetail;
}