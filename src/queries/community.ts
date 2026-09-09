/**
 * 社群与报告维度查询：社群信号 / 内容配方 / 粉丝质量 / 互动头部 / 邀请荣誉榜。
 * 均为轻量单查询，套 cachedQuery 边缘缓存（低频页 ttl 1h 足够）。
 */
import { CACHE_KEYS, cachedQuery } from "../cache";

/** 社群信号（共同关注 / 社群热议）：三级页面「内容」的社群品味策展数据源 */
export async function getCommunitySignals(env: Env): Promise<Array<{ kind: string; handle: string; name: string | null; count: number }>> {
  return cachedQuery(env, CACHE_KEYS.communitySignals, 3600, async () => {
    const { results } = await env.DB.prepare(
      `SELECT kind, handle, name, count FROM community_signal_counts
       ORDER BY kind, count DESC`
    ).all();
    return results as never as Array<{ kind: string; handle: string; name: string | null; count: number }>;
  });
}

/** 内容配方（内容页「社群黄金时段 / 什么形态最吃香」）：近 30 天帖子按形态与北京时间小时桶聚合平均曝光 */
export async function getContentRecipe(env: Env): Promise<{
  forms: Array<{ label: string; count: number; avgViews: number }>;
  hours: Array<{ hour: number; count: number; avgViews: number }>;
}> {
  return cachedQuery(env, CACHE_KEYS.contentRecipe, 3600, async () => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { results: rows } = await env.DB.prepare(
      `SELECT text, views_count AS views, created_at AS createdAt FROM posts WHERE created_at >= ?1`
    ).bind(cutoff).all();
    const posts = rows as never as Array<{ text: string | null; views: number | null; createdAt: string }>;
    const formMap = new Map<string, { count: number; views: number }>();
    const hourMap = new Map<number, { count: number; views: number }>();
    for (const p of posts) {
      const v = p.views ?? 0;
      const text = (p.text ?? "").toLowerCase();
      const hasLink = /https?:\/\//.test(text);
      const isLong = text.length > 120;
      const form = hasLink ? "带链接" : isLong ? "长文本" : "短文本";
      const f = formMap.get(form) ?? { count: 0, views: 0 };
      f.count++;
      f.views += v;
      formMap.set(form, f);
      const hour = (new Date(p.createdAt).getUTCHours() + 8) % 24;
      const h = hourMap.get(hour) ?? { count: 0, views: 0 };
      h.count++;
      h.views += v;
      hourMap.set(hour, h);
    }
    return {
      forms: [...formMap.entries()]
        .map(([label, d]) => ({ label, count: d.count, avgViews: d.count ? Math.round(d.views / d.count) : 0 }))
        .sort((a, b) => b.count - a.count),
      hours: [...hourMap.entries()]
        .map(([hour, d]) => ({ hour, count: d.count, avgViews: d.count ? Math.round(d.views / d.count) : 0 }))
        .filter((x) => x.count >= 2)
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, 5),
    };
  });
}

/** 粉丝质量聚合（社群能量报告 /report 用）：fan_profiles 全量样本指标 */
export async function getFanOverview(env: Env): Promise<Array<{ memberId: string; sampleSize: number; pctFollowers10k: number; verifiedPct: number }>> {
  return cachedQuery(env, CACHE_KEYS.fanOverview, 3600, async () => {
    const { results } = await env.DB.prepare(
      `SELECT member_id AS memberId, sample_size AS sampleSize,
              pct_followers_10k AS pctFollowers10k, verified_pct AS verifiedPct
       FROM fan_profiles`
    ).all();
    return results as never as Array<{ memberId: string; sampleSize: number; pctFollowers10k: number; verifiedPct: number }>;
  });
}

/** 帖子互动顶部：互动率中位数 >0 的成员里取近 30 天强互动的成员（社群能量报告维度，轻量查询） */
export async function getTopEngagementMembers(env: Env): Promise<Array<{ memberId: string; n: number }>> {
  return cachedQuery(env, CACHE_KEYS.topEngagement, 3600, async () => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { results } = await env.DB.prepare(
      `SELECT member_id AS memberId, COUNT(*) AS n FROM posts
       WHERE created_at >= ?1 AND views_count >= 1000 GROUP BY member_id ORDER BY n DESC LIMIT 8`
    ).bind(cutoff).all();
    return results as never as Array<{ memberId: string; n: number }>;
  });
}

/** 邀请裂变荣誉榜：谁带来了最多新成员（invite_events 聚合，queries 层；/report 展示） */
export async function getInviteLeaders(env: Env): Promise<Array<{ inviterId: string; n: number; handle: string; displayName: string | null; profileImage: string | null }>> {
  return cachedQuery(env, CACHE_KEYS.inviteLeaders, 3600, async () => {
    const { results } = await env.DB.prepare(
      `SELECT ie.inviter_id AS inviterId, COUNT(*) AS n, m.handle, m.display_name AS displayName, m.profile_image AS profileImage
       FROM invite_events ie JOIN members m ON m.id = ie.inviter_id
       WHERE m.status = 'active'
       GROUP BY ie.inviter_id ORDER BY n DESC LIMIT 8`
    ).all();
    return results as never as Array<{ inviterId: string; n: number; handle: string; displayName: string | null; profileImage: string | null }>;
  });
}
