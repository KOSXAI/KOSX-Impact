/**
 * 共享查询层：Hono API 路由与 TanStack Start SSR（server functions）都从这里取数。
 * 复用同一批 Cache API 缓存键（按绝对 URL），SSR 与 API 端点共享边缘缓存，
 * 不因前端迁移增加 D1 行读取。缓存键带 cache_bust 数据版本：
 * 采集/提交写库后版本 +1，新键在各区必然 miss → 数据变化后刷新立即可见。
 */
import type { DashboardStats, MemberDetail, PostItem, MentionItem, TrackStats, FanProfile, SimilarAccount } from "./stats";
import { computeDashboardStats, computeMemberStats, computeCountDelta } from "./stats";
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
  views_count AS views, like_count AS likes, reply_count AS replies,
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
      list.push({ tweetId: r.tweetId, createdAt: r.createdAt, text: r.text, views: r.views, likes: r.likes, replies: r.replies, retweets: r.retweets, quotes: r.quotes, bookmarks: r.bookmarks });
      postsByMember.set(r.memberId, list);
    }

    // 品牌声量：最近 20 条站外提及
    const { results: mentionRows } = await env.DB.prepare(
      `SELECT keyword, author_handle AS authorHandle, author_name AS authorName, text,
              tweet_url AS url, sentiment, collected_at AS collectedAt
       FROM mentions ORDER BY collected_at DESC LIMIT 20`
    ).all();
    const mentions: MentionItem[] = mentionRows as never as MentionItem[];

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

    // 影响力指数：近 30 天帖子 + 最新快照列表收录数 + verified（逐成员）
    const rowById = new Map(memberStats.map((m) => [m.id, m]));
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
    };
    return new Response(JSON.stringify(detail), { headers: { "Content-Type": "application/json" } });
  });
  if (res.status === 404) return null;
  return (await res.json()) as MemberDetail;
}