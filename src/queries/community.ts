/**
 * 社群与报告维度查询：社群信号 / 内容配方 / 粉丝质量 / 互动头部 / 邀请荣誉榜。
 * 均为轻量单查询，套 cachedQuery 边缘缓存（低频页 ttl 1h 足够）。
 * D1 行类型直接标在 .all<T>() 上（列别名即类型），不再散落 as never as 断言。
 */
import { CACHE_KEYS, cachedQuery } from "../cache";

type CommunitySignalRow = { kind: string; handle: string; name: string | null; count: number };

/** 社群信号（共同关注 / 社群热议）：三级页面「内容」的社群品味策展数据源 */
export async function getCommunitySignals(env: Env): Promise<CommunitySignalRow[]> {
  return cachedQuery(env, CACHE_KEYS.communitySignals, 3600, async () => {
    const { results } = await env.DB.prepare(
      `SELECT kind, handle, name, count FROM community_signal_counts
       ORDER BY kind, count DESC`
    ).all<CommunitySignalRow>();
    return results;
  });
}

type PostFormRow = {
  text: string | null;
  views: number | null;
  createdAt: string;
  tweetType: string | null;
  mediaKind: string | null;
  mediaCount: number | null;
  likes: number | null;
  replies: number | null;
  retweets: number | null;
  quotes: number | null;
  bookmarks: number | null;
};

/**
 * 帖子形态分类：媒体优先。
 * X 把附件也包成正文里的一条 t.co，只看正文有没有链接会把图片/视频帖误判成「带链接」
 * （实测该误判把「带链接」类均值抬到 3 万，全是单图纯媒体帖）——先看 media 再退回文本。
 * 动图归入视频（X 上 animated_gif 本就是视频的一种变体，且样本仅个位数）。
 */
function formOf(p: PostFormRow): string {
  if (p.mediaKind === "video" || p.mediaKind === "gif") return "视频";
  if (p.mediaKind === "photo") return (p.mediaCount ?? 1) > 1 ? "多图" : "单图";
  const text = p.text ?? "";
  if (/https?:\/\//.test(text)) return "带链接";
  return text.length > 120 ? "长文" : "短文本";
}

/** 单帖互动合计（赞+评+转+引+藏；缺失项按 0 计） */
function engagementOf(p: PostFormRow): number {
  return (p.likes ?? 0) + (p.replies ?? 0) + (p.retweets ?? 0) + (p.quotes ?? 0) + (p.bookmarks ?? 0);
}

/**
 * 内容配方（内容页「社群黄金时段 / 什么形态最吃香」）：近 30 天帖子按形态与北京时间小时桶聚合。
 *
 * 口径三则：
 * - 只看本人原创与引用帖（回复/转推是互动不是发布，转推均值仅 20 浏览会严重拉低时段与形态均值）
 * - 只统计有浏览数的帖子（本区块讲曝光，无浏览数据无从计入）
 * - 除平均曝光外给出互动率（互动合计/浏览的池化比值）——曝光随账号量级走，互动率才是跨账号可比的口径
 */
export async function getContentRecipe(env: Env): Promise<{
  forms: Array<{ label: string; count: number; avgViews: number; engagementRate: number | null }>;
  hours: Array<{ hour: number; count: number; avgViews: number }>;
}> {
  return cachedQuery(env, CACHE_KEYS.contentRecipe, 3600, async () => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { results: posts } = await env.DB.prepare(
      `SELECT text, views_count AS views, created_at AS createdAt, tweet_type AS tweetType,
              json_extract(media, '$[0].kind') AS mediaKind, json_array_length(media) AS mediaCount,
              like_count AS likes, reply_count AS replies, retweet_count AS retweets,
              quote_count AS quotes, bookmark_count AS bookmarks
       FROM posts
       WHERE created_at >= ?1 AND views_count IS NOT NULL
         AND (tweet_type IS NULL OR tweet_type IN ('tweet', 'quote'))`
    ).bind(cutoff).all<PostFormRow>();

    const formMap = new Map<string, { count: number; views: number; engagement: number }>();
    const hourMap = new Map<number, { count: number; views: number }>();
    for (const p of posts) {
      const v = p.views ?? 0;
      const form = formOf(p);
      const f = formMap.get(form) ?? { count: 0, views: 0, engagement: 0 };
      f.count++;
      f.views += v;
      f.engagement += engagementOf(p);
      formMap.set(form, f);
      const hour = (new Date(p.createdAt).getUTCHours() + 8) % 24;
      const h = hourMap.get(hour) ?? { count: 0, views: 0 };
      h.count++;
      h.views += v;
      hourMap.set(hour, h);
    }
    return {
      // 样本 <3 的形态不出（个位数样本的均值是噪声不是信号）
      forms: [...formMap.entries()]
        .filter(([, d]) => d.count >= 3)
        .map(([label, d]) => ({
          label,
          count: d.count,
          avgViews: Math.round(d.views / d.count),
          engagementRate: d.views > 0 ? d.engagement / d.views : null,
        }))
        .sort((a, b) => b.avgViews - a.avgViews),
      hours: [...hourMap.entries()]
        .map(([hour, d]) => ({ hour, count: d.count, avgViews: d.count ? Math.round(d.views / d.count) : 0 }))
        .filter((x) => x.count >= 2)
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, 5),
    };
  });
}

type FanOverviewRow = { memberId: string; sampleSize: number; pctFollowers10k: number; verifiedPct: number };

/** 粉丝质量聚合（社群能量报告 /report 用）：fan_profiles 全量样本指标 */
export async function getFanOverview(env: Env): Promise<FanOverviewRow[]> {
  return cachedQuery(env, CACHE_KEYS.fanOverview, 3600, async () => {
    const { results } = await env.DB.prepare(
      `SELECT member_id AS memberId, sample_size AS sampleSize,
              pct_followers_10k AS pctFollowers10k, verified_pct AS verifiedPct
       FROM fan_profiles`
    ).all<FanOverviewRow>();
    return results;
  });
}

type TopEngagementRow = { memberId: string; n: number };

/** 帖子互动顶部：互动率中位数 >0 的成员里取近 30 天强互动的成员（社群能量报告维度，轻量查询） */
export async function getTopEngagementMembers(env: Env): Promise<TopEngagementRow[]> {
  return cachedQuery(env, CACHE_KEYS.topEngagement, 3600, async () => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    // 刻意不换 covering index：posts 有 90 天保留窗口，30 天窗口≈整表的 98%，
    // 而 idx_posts_member_created 的 member_id 序让 GROUP BY 免排序。
    // 实测（线上数据）：保留原计划 7422 行读取，改走 (created_at, views_count, member_id)
    // 覆盖索引反而 9861 行（范围只削掉 2%，却多背一次 GROUP BY 排序）。
    const { results } = await env.DB.prepare(
      `SELECT member_id AS memberId, COUNT(*) AS n FROM posts
       WHERE created_at >= ?1 AND views_count >= 1000 GROUP BY member_id ORDER BY n DESC LIMIT 8`
    ).bind(cutoff).all<TopEngagementRow>();
    return results;
  });
}

type InviteLeaderRow = { inviterId: string; n: number; handle: string; displayName: string | null; profileImage: string | null };

/** 邀请裂变荣誉榜：谁带来了最多新成员（invite_events 聚合，queries 层；/report 展示） */
export async function getInviteLeaders(env: Env): Promise<InviteLeaderRow[]> {
  return cachedQuery(env, CACHE_KEYS.inviteLeaders, 3600, async () => {
    const { results } = await env.DB.prepare(
      `SELECT ie.inviter_id AS inviterId, COUNT(*) AS n, m.handle, m.display_name AS displayName, m.profile_image AS profileImage
       FROM invite_events ie JOIN members m ON m.id = ie.inviter_id
       WHERE m.status = 'active'
       GROUP BY ie.inviter_id ORDER BY n DESC LIMIT 8`
    ).all<InviteLeaderRow>();
    return results;
  });
}
