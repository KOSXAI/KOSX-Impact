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
  POST_VALUE_FALLBACK_SQL,
  TOP_POST_DISPLAY_FIELDS,
  TOP_POST_FIELDS,
  parseStrArray,
  postEngagementValue,
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
      // views 缺失时用五项互动合计估算排序（postEngagementValue 同口径，避免高互动帖被筛掉）；
      // 各互动项自身也要 COALESCE——SQLite 里 NULL 参与加法会把整个兜底值毒化成 NULL
      const { results: rows } = await env.DB.prepare(
        `SELECT ${TOP_POST_DISPLAY_FIELDS}
         FROM posts p
         JOIN members m ON m.id = p.member_id
         WHERE m.status = 'active' AND p.created_at >= ?1
         ORDER BY ${POST_VALUE_FALLBACK_SQL
           .replace("views_count", "p.views_count")
           .replace("like_count", "p.like_count")
           .replace("reply_count", "p.reply_count")
           .replace("retweet_count", "p.retweet_count")
           .replace("quote_count", "p.quote_count")
           .replace("bookmark_count", "p.bookmark_count")} DESC LIMIT ?2`
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

/**
 * 内容洞察（/posts 页专用）：爆款帖 / 停更成员 / 话题标签云。
 * 只需 members + 近 30 天 posts 两张表联查——/posts 页不再为拿 insights
 * 拉整份 dashboard（旧 loader 连带触发互推图谱/关注网/粉丝画像等全部重查询）。
 */
export async function getInsights(env: Env): Promise<DashboardStats["insights"]> {
  const bust = await readCacheBust(env);
  const res = await cachedResponse(
    new Request(`${SITE_URL}${CACHE_KEYS.insights}&cb=${bust}`),
    3600,
    async () => {
      const now = new Date().toISOString();
      const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { results: memberRows } = await env.DB.prepare(
        `SELECT m.id, m.handle, m.display_name AS displayName, m.profile_image AS profileImage, m.tags
         FROM members m WHERE m.status = 'active' ORDER BY joined_at`
      ).all();
      const members = memberRows as never as Array<{
        id: string;
        handle: string;
        displayName: string | null;
        profileImage: string | null;
        tags: string | null;
      }>;
      const { results: postRows } = await env.DB.prepare(
        `SELECT p.tweet_id AS tweetId, p.created_at AS createdAt, p.text,
                p.views_count AS views, p.views_prev AS viewsPrev, p.recorded_at AS postRecordedAt,
                p.like_count AS likes, p.reply_count AS replies,
                p.retweet_count AS retweets, p.quote_count AS quotes, p.bookmark_count AS bookmarks,
                p.member_id AS memberId
         FROM posts p JOIN members m ON m.id = p.member_id
         WHERE m.status = 'active' AND p.created_at >= ?1`
      ).bind(cutoff30d).all();
      const postsByMember = new Map<string, PostRow[]>();
      for (const r of postRows as never as Array<PostRow & { memberId: string }>) {
        const list = postsByMember.get(r.memberId) ?? [];
        list.push(r);
        postsByMember.set(r.memberId, list);
      }

      const viralPosts: PostItem[] = [];
      const inactiveMembers: DashboardStats["insights"]["inactiveMembers"] = [];
      for (const m of members) {
        const posts = postsByMember.get(m.id) ?? [];
        const ins = computeMemberInsights(posts, now);
        const member = { id: m.id, handle: m.handle, displayName: m.displayName, profileImage: m.profileImage };
        for (const v of detectViral(posts)) {
          viralPosts.push({ ...mapPostRow(v as PostRow, m.handle), member });
        }
        if (ins.inactive && typeof ins.inactiveDays === "number") {
          inactiveMembers.push({ memberId: m.id, handle: m.handle, displayName: m.displayName, days: ins.inactiveDays });
        }
      }
      viralPosts.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
      inactiveMembers.sort((a, b) => b.days - a.days);
      const tagCounts = new Map<string, number>();
      for (const m of members) {
        for (const t of parseStrArray(m.tags)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
      const tagCloud = [...tagCounts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      const insights = { viralPosts: viralPosts.slice(0, 8), inactiveMembers, tagCloud };
      return new Response(JSON.stringify(insights), { headers: { "Content-Type": "application/json" } });
    }
  );
  return (await res.json()) as DashboardStats["insights"];
}

/** 对比页选人列表（轻量）：id/handle/展示头像/最新粉丝/赛道，替代拉整份 dashboard */
export async function getMemberPicker(
  env: Env
): Promise<Array<{ id: string; handle: string; displayName: string | null; profileImage: string | null; latestFollowers: number | null; tracks: string[] }>> {
  const bust = await readCacheBust(env);
  const res = await cachedResponse(
    new Request(`${SITE_URL}${CACHE_KEYS.memberPicker}&cb=${bust}`),
    3600,
    async () => {
      const { results: rows } = await env.DB.prepare(
        `SELECT m.id, m.handle, m.display_name AS displayName, m.profile_image AS profileImage, m.tracks,
                (SELECT s.followers FROM snapshots s WHERE s.member_id = m.id ORDER BY s.recorded_at DESC LIMIT 1) AS latestFollowers
         FROM members m WHERE m.status = 'active' ORDER BY joined_at`
      ).all();
      const members = (rows as never as Array<{ id: string; handle: string; displayName: string | null; profileImage: string | null; latestFollowers: number | null; tracks: string | null }>)
        .map((m) => ({ ...m, tracks: parseStrArray(m.tracks) }));
      return new Response(JSON.stringify(members), { headers: { "Content-Type": "application/json" } });
    }
  );
  return (await res.json()) as Array<{ id: string; handle: string; displayName: string | null; profileImage: string | null; latestFollowers: number | null; tracks: string[] }>;
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

    // 首采失败态：从未有快照且刷新队列最近一次记录为 failed（查无账号/持续报错），
    // 与「排队中」区分用；只查有失败记录的无快照成员， fans 面很小
    const failedIds = new Set<string>();
    {
      const { results: failedRows } = await env.DB.prepare(
        `SELECT rq.member_id AS memberId FROM refresh_queue rq
         WHERE rq.status = 'failed'
           AND NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.member_id = rq.member_id)
           AND EXISTS (SELECT 1 FROM members m WHERE m.id = rq.member_id AND m.status = 'active')
         GROUP BY rq.member_id`
      ).all();
      for (const r of failedRows as never as Array<{ memberId: string }>) failedIds.add(r.memberId);
    }

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
       FROM posts WHERE created_at >= ?1
         AND EXISTS (SELECT 1 FROM members m WHERE m.id = posts.member_id AND m.status = 'active')`
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
      return { ...m, snapshots, tracks: parseStrArray(m.tracks), tags: parseStrArray(m.tags), collectFailed: failedIds.has(m.id) };
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
      // 单条合并正则（@handle1|handle2|...）一次扫描全帖文本：旧版逐成员建正则、
      // 逐帖逐成员两两扫是成员×帖子的平方级， grows 后会撞 Workers CPU 上限；
      // handle 归一化后仅 [a-z0-9_]，无需转义
      const re = new RegExp(`@(${[...handleToId.keys()].join("|")})(?![\\w])`, "g");
      const edgeMap = new Map<string, number>();
      for (const [fromId, posts] of postsByMember) {
        for (const p of posts) {
          if (!p.text) continue;
          const text = p.text.toLowerCase();
          const seenTo = new Set<string>();
          re.lastIndex = 0;
          for (let match = re.exec(text); match; match = re.exec(text)) {
            const toId = handleToId.get(match[1]);
            // 口径与旧版一致：一帖内同一成员被 @ 多次也只计 1 条边
            if (!toId || toId === fromId || seenTo.has(toId)) continue;
            seenTo.add(toId);
            const key = `${fromId}\u0000${toId}`;
            edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
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

    // 名次环比：昨日各成员粉丝量排名 vs 今日排名（快照窗口内倒数第二个不同自然日的快照为昨日基准）
    {
      const snapOf = (rowIndex: number, which: "latest" | "prev") => {
        const snaps = memberStats[rowIndex].snapshots;
        if (snaps.length === 0) return null;
        if (which === "latest") return snaps[snaps.length - 1].followers;
        const latestDay = snaps[snaps.length - 1].recordedAt.slice(0, 10);
        for (let i = snaps.length - 2; i >= 0; i--) {
          if (snaps[i].recordedAt.slice(0, 10) !== latestDay) return snaps[i].followers;
        }
        return null;
      };
      const rankNowPairs: Array<{ id: string; v: number }> = [];
      const rankPrevPairs: Array<{ id: string; v: number }> = [];
      for (let i = 0; i < memberStats.length; i++) {
        const latest = snapOf(i, "latest");
        const prev = snapOf(i, "prev");
        if (latest != null) rankNowPairs.push({ id: memberStats[i].id, v: latest });
        if (prev != null) rankPrevPairs.push({ id: memberStats[i].id, v: prev });
      }
      const rankMap = (pairs: typeof rankNowPairs) => {
        pairs.sort((a, b) => b.v - a.v);
        return new Map(pairs.map((p, idx) => [p.id, idx + 1]));
      };
      const today = rankMap(rankNowPairs);
      const yesterday = rankMap(rankPrevPairs);
      for (const ms of stats.members) {
        const a = today.get(ms.id);
        const b = yesterday.get(ms.id);
        ms.rankDelta = a != null && b != null ? b - a : null;
      }
    }

    // 今日爆帖：近 24h 刷新过且 views 相比上次抓取上涨的帖子，按增量降序（正在发生的口径）
    {
      const refreshSince = new Date(Date.now() - 26 * 3600_000).toISOString();
      const memberInfo = new Map(memberStats.map((m) => [m.id, m]));
      const trending: PostItem[] = [];
      for (const [memberId, posts] of postsByMember) {
        const row = memberInfo.get(memberId);
        if (!row) continue;
        const member = { id: row.id, handle: row.handle, displayName: row.displayName, profileImage: row.profileImage };
        for (const p of posts) {
          if (!p.postRecordedAt || p.postRecordedAt < refreshSince) continue;
          if (p.views == null || p.viewsPrev == null || p.views <= p.viewsPrev) continue;
          trending.push({
            ...mapPostRow(p, row.handle),
            viewsGain: p.views - p.viewsPrev,
            member,
          });
        }
      }
      stats.trendingPosts = trending.sort((a, b) => (b.viewsGain ?? 0) - (a.viewsGain ?? 0)).slice(0, 6);
    }
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

    // 成员话题统计：tags 聚合的「话题 → 成员数 / 近 30 天帖子总浏览 / 粉丝净增」（首页话题窗格数据源）
    {
      const views30dOfMember = new Map(stats.members.map((m) => [m.id, m.views30d ?? 0]));
      const growth30dOfMember = new Map(stats.members.map((m) => [m.id, m.growth30d]));
      const memberByTag = new Map<string, typeof memberStats>();
      for (const m of memberStats) {
        for (const t of m.tags) {
          const list = memberByTag.get(t) ?? [];
          list.push(m);
          memberByTag.set(t, list);
        }
      }
      stats.topicStats = [...memberByTag.entries()]
        .map(([tag, list]) => ({
          tag,
          memberCount: list.length,
          views30d: list.reduce((s, m) => s + (views30dOfMember.get(m.id) ?? 0), 0),
          growth30d: list.reduce((s, m) => s + (growth30dOfMember.get(m.id) ?? 0), 0),
        }))
        .filter((t) => t.memberCount > 0)
        .sort((a, b) => b.memberCount - a.memberCount || b.views30d - a.views30d)
        .slice(0, 12);
    }

    // 社群内部关注网：follows 表成员成员互相关注对（表未迁移时静默降级，首页隐藏信号）
    try {
      const { results: followRows } = await env.DB.prepare(
        "SELECT follower_user_id, followed_user_id FROM follows"
      ).all();
      const edges = followRows as never as Array<{ follower_user_id: string; followed_user_id: string }>;
      const activeUserIds = new Set(
        (await env.DB.prepare("SELECT user_id FROM members WHERE status = 'active' AND user_id IS NOT NULL").all())
          .results.map((r) => String((r as { user_id: string }).user_id))
      );
      const edgeSet = new Set<string>();
      for (const r of edges) {
        const from = String(r.follower_user_id);
        const to = String(r.followed_user_id);
        // 只统计两端都是活跃成员的对，避免离场成员污染信号带
        if (activeUserIds.has(from) && activeUserIds.has(to)) edgeSet.add(`${from}\u0000${to}`);
      }
      let mutualPairs = 0;
      for (const key of edgeSet) {
        const [from, to] = key.split("\u0000");
        if (edgeSet.has(`${to}\u0000${from}`)) mutualPairs++;
      }
      if (mutualPairs > 0) {
        stats.followNet = { mutualPairs: mutualPairs / 2, trackedMembers: activeUserIds.size };
      }
    } catch {
      // follows 表还没建时（首次部署前 / 本地旧库）不带该字段
    }

    // 粉丝画像总览：fan_profiles 全成员样本按样本量加权（大屏数据质量 chip；月度采样管道已存在）
    try {
      const { results: fanRows } = await env.DB.prepare(
        `SELECT m.id AS memberId, fp.sampled_at AS sampledAt, fp.sample_size AS sampleSize,
                fp.avg_followers AS avgFollowers, fp.pct_followers_10k AS pct10k, fp.verified_pct AS verifiedPct
         FROM fan_profiles fp JOIN members m ON m.id = fp.member_id
         WHERE m.status = 'active' AND fp.sample_size > 0`
      ).all();
      type FanRowDTO = { memberId: string; sampledAt: string; sampleSize: number; avgFollowers: number | null; pct10k: number | null; verifiedPct: number | null };
      const fans = fanRows as never as FanRowDTO[];
      if (fans.length > 0) {
        const totalSample = fans.reduce((s, f) => s + f.sampleSize, 0);
        const weighted = (pick: (f: FanRowDTO) => number | null) => {
          let sum = 0;
          let n = 0;
          for (const f of fans) {
            const v = pick(f);
            if (v == null) continue;
            sum += v * f.sampleSize;
            n += f.sampleSize;
          }
          return n > 0 ? sum / n : null;
        };
        stats.fansSample = {
          sampledAt: fans.map((f) => f.sampledAt).sort().at(-1)!,
          sampleSize: totalSample,
          avgFollowers: weighted((f) => f.avgFollowers),
          pct10k: weighted((f) => f.pct10k),
          verifiedPct: weighted((f) => f.verifiedPct),
        };
      }
    } catch {
      // fan_profiles 表缺失时静默降级
    }

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
      const viewKey = postEngagementValue;
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
