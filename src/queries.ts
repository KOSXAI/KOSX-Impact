/**
 * 共享查询层：Hono API 路由与 TanStack Start SSR（server functions）都从这里取数。
 * 复用同一批 Cache API 缓存键（按绝对 URL），SSR 与 API 端点共享边缘缓存，
 * 不因前端迁移增加 D1 行读取。缓存键带 cache_bust 数据版本：
 * 采集/提交写库后版本 +1，新键在各区必然 miss → 数据变化后刷新立即可见。
 */
import type { DashboardStats, MemberDetail, PostItem } from "./stats";
import { computeDashboardStats, computeMemberStats, computeCountDelta } from "./stats";
import { MILESTONE_THRESHOLDS } from "./milestones";
import { roster } from "./roster";
import { CACHE_KEYS, cachedResponse, readCacheBust } from "./cache";
import { SITE_URL } from "./lib/site";

// Env 由 worker-configuration.d.ts / env.d.ts 全局声明（无单独模块）

const MEMBER_FIELDS = `id, handle, display_name AS displayName, joined_at AS joinedAt, profile_image AS profileImage`;
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
};
type SnapshotRow = { memberId: string; followers: number; recordedAt: string };
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
      "SELECT member_id AS memberId, followers, recorded_at AS recordedAt FROM snapshots WHERE member_id = ?1 ORDER BY recorded_at DESC LIMIT 31"
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

    const memberStats = memberList.map((m, i) => {
      const rows = (snapshotBatches[i]?.results ?? []) as never as SnapshotRow[];
      // 窗口内是倒序取的，统计层期望正序
      const snapshots = rows.slice().reverse();
      return { ...m, snapshots };
    });

    // 与 API JSON 响应同构：computeDashboardStats 输出即 DashboardStats（trend 由快照窗口推导）
    const stats = computeDashboardStats(roster, memberStats, milestoneRows as never, now);
    // 帖子互动 Top：纯函数层返回空数组，这里用真实查询覆盖
    stats.topPosts = topPosts;
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
      `SELECT ${MEMBER_FIELDS},
              bio, location, url, banner_url AS bannerUrl, x_created_at AS xCreatedAt, verified
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
    };

    // 帖子活跃度：近 20 帖 + 互动合计（posts 表，尚未采集到时为 null）
    const postActivity = await getPostActivity(env, memberRow.id, memberRow.handle);

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
    };
    return new Response(JSON.stringify(detail), { headers: { "Content-Type": "application/json" } });
  });
  if (res.status === 404) return null;
  return (await res.json()) as MemberDetail;
}