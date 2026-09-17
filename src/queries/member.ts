/**
 * 成员详情查询：getMemberDetail（/api/members/:id 与成员页 SSR 共用）。
 * 缓存键 ${SITE_URL}/api/members/:id&cb=数据版本。
 */
import type { MemberDetail, FanProfile, SimilarAccount } from "../stats";
import { computeMemberStats, computeCountDelta } from "../stats";
import { computeInfluence } from "../influence";
import { computeMemberInsights } from "../insights";
import { MILESTONE_THRESHOLDS } from "../milestones";
import { CACHE_KEYS, cachedResponse, isSafeCacheKey, readCacheBust } from "../cache";
import { SITE_URL } from "../lib/site";
import {
  LATEST_FOLLOWERS_SQL,
  rankInTrack,
  MEMBER_FIELDS,
  POST_FIELDS,
  POST_DISPLAY_FIELDS,
  mapPostRow,
  parseJsonArray,
  parseStrArray,
  type PostRow,
} from "./shared";

/** D1 行类型集中定义（列别名即形状，.all<T>() / .first<T>() 直接标注） */
type SnapshotRowFull = {
  followers: number;
  following: number | null;
  posts: number | null;
  listedCount: number | null;
  favouritesCount: number | null;
  recordedAt: string;
};
type MemberDetailRow = {
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
type FanProfileRow = Omit<FanProfile, "topHandles"> & { topHandlesRaw: string | null };
type NeighborRow = { id: string; handle: string; displayName: string | null; profileImage: string | null; tracks: string | null; followers: number | null };
type FanCircleRow = NeighborRow & { topHandlesRaw: string | null };
type MilestoneRow = { threshold: number; achievedAt: string };

/** 成员近 N 帖 + 互动合计（返回 null 表示该成员尚无帖子数据） */
async function getPostActivity(env: Env, memberId: string, handle: string, limit = 20): Promise<MemberDetail["postActivity"]> {
  const { results: rows } = await env.DB.prepare(
    `SELECT ${POST_DISPLAY_FIELDS} FROM posts WHERE member_id = ?1 ORDER BY created_at DESC LIMIT ?2`
  ).bind(memberId, limit).all<PostRow>();
  const posts = rows.map((r) => mapPostRow(r, handle));
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

/** 成员详情（/api/members/:id 与成员页 SSR 共用，缓存键 ${SITE_URL}/api/members/:id&cb=数据版本） */
export async function getMemberDetail(env: Env, id: string): Promise<MemberDetail | null> {
  // id 来自 URL 参数（Hono 会解码 %2E 等转义）并直接拼进缓存键：含 `..`/`#` 的串
  // 经 URL 规范化能逃逸到别的缓存槽（缓存投毒）。非法 id 一律当作「查无此成员」。
  if (!isSafeCacheKey(CACHE_KEYS.memberDetail(id))) return null;
  const bust = await readCacheBust(env);
  const res = await cachedResponse(
    new Request(`${SITE_URL}${CACHE_KEYS.memberDetail(id)}&cb=${bust}`),
    3600,
    async () => {
    const member = await env.DB.prepare(
      `SELECT ${MEMBER_FIELDS}, location, url, x_created_at AS xCreatedAt
       FROM members WHERE id = ? AND status = 'active'`
    ).bind(id).first<MemberDetailRow & { verified: number | null }>();
    if (!member) return new Response(JSON.stringify({ error: "member not found" }), { status: 404 });

    const { results: snapshots } = await env.DB.prepare(
      `SELECT followers, following, posts, listed_count AS listedCount, favourites_count AS favouritesCount,
              recorded_at AS recordedAt
       FROM snapshots WHERE member_id = ? ORDER BY recorded_at`
    ).bind(id).all<SnapshotRowFull>();
    const { results: milestones } = await env.DB.prepare(
      "SELECT threshold, achieved_at AS achievedAt FROM milestones WHERE member_id = ? ORDER BY threshold"
    ).bind(id).all<MilestoneRow>();
    // 只展示称号大关上的档位（旧阶梯档位不再展示）
    const ladderSet = new Set(MILESTONE_THRESHOLDS);
    const ladderMilestones = milestones.filter((r) => ladderSet.has(r.threshold));

    const memberRow = member!;
    // 帖子活跃度：近 20 帖 + 互动合计（posts 表，尚未采集到时为 null）
    const postActivity = await getPostActivity(env, memberRow.id, memberRow.handle);

    // 近 30 天帖子：影响力指数 + 内容洞察（爆款 / 停更 / 互动率中位数）
    const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { results: post30dRows } = await env.DB.prepare(
      `SELECT ${POST_FIELDS} FROM posts WHERE member_id = ?1 AND created_at >= ?2`
    ).bind(memberRow.id, cutoff30d).all<PostRow>();
    const posts30d = post30dRows;

    // 粉丝圈画像（尚未采样为 null）
    const fanRow = await env.DB.prepare(
      `SELECT sampled_at AS sampledAt, sample_size AS sampleSize, avg_followers AS avgFollowers,
              pct_followers_1k AS pctFollowers1k, pct_followers_10k AS pctFollowers10k,
              verified_pct AS verifiedPct, avg_friends AS avgFriends, avg_tweets AS avgTweets,
              avg_age_days AS avgAgeDays, top_handles AS topHandlesRaw
       FROM fan_profiles WHERE member_id = ?1`
    ).bind(memberRow.id).first<FanProfileRow>();
    let fanProfile: FanProfile | null = null;
    if (fanRow) {
      const fr = fanRow;
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

    // 相似账号推荐
    const { results: similarRows2 } = await env.DB.prepare(
      `SELECT handle, name, avatar, reason, difference, created_at AS createdAt
       FROM similar_accounts WHERE member_id = ?1 ORDER BY created_at`
    ).bind(memberRow.id).all<SimilarAccount>();
    const similarAccounts = similarRows2;

    // 赛道邻居：本成员在各赛道内的名次 + 同赛道其他成员（引流 / SEO 用，轻量单查询）
    const { results: neighborRows } = await env.DB.prepare(
      `SELECT m.id, m.handle, m.display_name AS displayName, m.profile_image AS profileImage, m.tracks,
              ${LATEST_FOLLOWERS_SQL} AS followers
       FROM members m WHERE m.status = 'active'`
    ).all<NeighborRow>();
    const myTracks = parseStrArray(memberRow.tracks);
    const allNeighbors = neighborRows.map((r) => ({ ...r, tracks: parseStrArray(r.tracks) }));
    const trackRanks = myTracks.map((track) => ({ track, ...rankInTrack(allNeighbors, memberRow.id, track) }));
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
                ${LATEST_FOLLOWERS_SQL} AS followers
         FROM fan_profiles fp JOIN members m ON m.id = fp.member_id
         WHERE m.status = 'active' AND m.id != ?1`
      ).bind(memberRow.id).all<FanCircleRow>();
      const candidates = fanCircleRows.map((r) => {
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

    const snapshotRows: SnapshotRowFull[] = snapshots;

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

    // 首采失败态：无快照且队列最近一次为 failed（OG 卡与「排队中」区分用）
    if (!snapshotRows.length) {
      const failedRow = await env.DB.prepare(
        "SELECT 1 AS x FROM refresh_queue INDEXED BY idx_refresh_queue_member_status WHERE member_id = ?1 AND status = 'failed' LIMIT 1"
      ).bind(memberRow.id).first<{ x: number }>();
      if (failedRow) stats.collectFailed = true;
    }

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
