/**
 * 看板与精华帖查询：getDashboardStats（/api/dashboard 与首页 SSR 共用）与 getTopPosts
 * （/api/top-posts）。缓存键带 cache_bust 数据版本，SSR 与 API 共享边缘缓存。
 */
import type { DashboardStats, PostItem, MentionItem, TrackStats } from "../stats";
import { computeDashboardStats, computeGrowthNDays } from "../stats";
import { computeInfluence } from "../influence";
import { computeMemberInsights, detectViral } from "../insights";
import { TRACKS, TRACK_OTHER } from "../tracks";
import { roster } from "../roster";
import { CACHE_KEYS, cachedResponse, readCacheBust } from "../cache";
import { SITE_URL } from "../lib/site";
import {
  MEMBER_FIELDS,
  POST_FIELDS,
  mapPostRow,
  median,
  TOP_POST_FIELDS,
  parseStrArray,
  type MemberRow,
  type PostRow,
  type SnapshotRow,
} from "./shared";

// Env 由 worker-configuration.d.ts / env.d.ts 全局声明（无单独模块）

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
      // views 缺失时用 赞+评论+转推 估算排序（COALESCE 兜底，避免高互动帖被筛掉）；
      // 各互动项自身也要 COALESCE——SQLite 里 NULL 参与加法会把整个兜底值毒化成 NULL
      const { results: rows } = await env.DB.prepare(
        `SELECT ${TOP_POST_FIELDS}
         FROM posts p
         JOIN members m ON m.id = p.member_id
         WHERE m.status = 'active' AND p.created_at >= ?1
         ORDER BY COALESCE(p.views_count, COALESCE(p.like_count, 0) + COALESCE(p.reply_count, 0) + COALESCE(p.retweet_count, 0)) DESC LIMIT ?2`
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
      `SELECT ${TOP_POST_FIELDS}
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
