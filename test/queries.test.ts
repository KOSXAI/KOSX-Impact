/**
 * queries/ 层集成测试：直接以测试 D1 调用查询函数（seed → 断言业务口径）。
 * 覆盖 getTopPosts（COALESCE 兜底排序）/ getDashboardStats 深层聚合（互推图谱 /
 * 爆款洞察 / 赛道能量 / 趋势）/ getDailyArchive / getAnnualReport / 社群信号与内容配方。
 *
 * 注意：查询层全部走 cachedResponse 边缘缓存（键带 site_meta.cache_bust），
 * beforeEach 递增 bust 让每个测试拿到新缓存键，避免上一测试的缓存串数据。
 */
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import "../src/api-entry";
import { getTopPosts } from "../src/queries";
import { getAnnualReport, getDailyArchive } from "../src/queries/archive";
import { getCommunitySignals, getContentRecipe } from "../src/queries/community";
import { getDashboardStats } from "../src/queries/dashboard";

const TABLES = [
  "refresh_queue",
  "milestones",
  "snapshots",
  "posts",
  "mentions",
  "member_mentions",
  "community_signal_counts",
  "fan_profiles",
  "similar_accounts",
  "invite_events",
  "members",
  "site_meta",
];

beforeEach(async () => {
  for (const t of TABLES) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
  // 换缓存键：避免上一测试写入的边缘缓存串数据
  await env.DB.prepare("INSERT INTO site_meta (key, value) VALUES ('cache_bust', ?)")
    .bind(String(Date.now()))
    .run();
});

async function seedMember(id: string, handle: string, over: { tracks?: string; tags?: string; joinedAt?: string } = {}) {
  await env.DB.prepare(
    "INSERT INTO members (id, handle, display_name, joined_at, tracks, tags) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, handle, id === "alice" ? "Alice" : "Bob", over.joinedAt ?? "2026-08-01", over.tracks ?? null, over.tags ?? null).run();
}

async function seedSnapshot(memberId: string, followers: number, recordedAt: string) {
  await env.DB.prepare(
    "INSERT INTO snapshots (member_id, followers, recorded_at) VALUES (?, ?, ?)"
  ).bind(memberId, followers, recordedAt).run();
}

async function seedPost(
  memberId: string,
  tweetId: string,
  over: {
    createdAt?: string;
    views?: number | null;
    viewsPrev?: number | null;
    likes?: number | null;
    replies?: number | null;
    retweets?: number | null;
    quotes?: number | null;
    bookmarks?: number | null;
    text?: string | null;
    recordedAt?: string;
    media?: Array<{ kind: string; url: string; videoUrl?: string }> | null;
    tweetType?: string | null;
  } = {}
) {
  await env.DB.prepare(
    `INSERT INTO posts (tweet_id, member_id, created_at, views_count, views_prev, like_count, reply_count, retweet_count, quote_count, bookmark_count, text, lang, media, tweet_type, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'zh', ?, ?, ?)`
  ).bind(
    tweetId,
    memberId,
    over.createdAt ?? new Date(Date.now() - 3 * 86_400_000).toISOString(),
    over.views ?? null,
    over.viewsPrev ?? null,
    over.likes ?? null,
    over.replies ?? null,
    over.retweets ?? null,
    over.quotes ?? null,
    over.bookmarks ?? null,
    over.text ?? null,
    over.media ? JSON.stringify(over.media) : null,
    over.tweetType ?? null,
    over.recordedAt ?? new Date().toISOString()
  ).run();
}

describe("getTopPosts", () => {
  it("views 缺失时按 赞+评+转 兜底排序，不让高互动帖被筛掉", async () => {
    await seedMember("alice", "alice_x");
    await seedPost("alice", "t1", { views: 100, likes: 5 });
    await seedPost("alice", "t2", { views: null, likes: 500, replies: 20 });

    const posts = await getTopPosts(env);
    expect(posts.map((p) => p.tweetId)).toEqual(["t2", "t1"]);
    expect(posts[0].url).toContain("/alice_x/status/t2");
    expect(posts[1].member?.handle).toBe("alice_x");
  });
});

describe("getDashboardStats 深层聚合", () => {
  it("互推图谱 / 爆款洞察 / 赛道能量 / 趋势 / 登阶一次成型", async () => {
    await seedMember("alice", "alice_x", { tracks: '["AI工具"]', tags: '["AI","效率"]' });
    await seedMember("bob", "bob_x", { tracks: '["财经"]' });
    const day1 = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const day2 = new Date(Date.now() - 1 * 86_400_000).toISOString();
    await seedSnapshot("alice", 900, day1);
    await seedSnapshot("alice", 1500, day2);
    await seedSnapshot("bob", 1200, day1);
    await seedSnapshot("bob", 1300, day2);
    // alice 3 帖（均值 3400，2×均值=6800 → 10000 帖为爆款）
    await seedPost("alice", "v1", { views: 10_000, likes: 100 });
    await seedPost("alice", "v2", { views: 100, likes: 1 });
    await seedPost("alice", "v3", { views: 100, likes: 1 });
    // bob 的帖子正文 @ 到 alice → 互推边
    await seedPost("bob", "m1", { views: 50, text: "强烈推荐看 @alice_x 的成长档案" });
    await env.DB.prepare(
      "INSERT INTO milestones (member_id, threshold, achieved_at, announced) VALUES (?, ?, ?, 1)"
    ).bind("alice", 1000, day2).run();

    const stats = await getDashboardStats(env);

    // 互推图谱：bob → alice（自提及除外）
    expect(stats.mutualEdges).toContainEqual({ from: "bob", to: "alice", count: 1 });
    // 爆款洞察：v1 入选且排序在前
    expect(stats.insights.viralPosts[0]?.tweetId).toBe("v1");
    // 话题标签云：tags 聚合
    expect(stats.insights.tagCloud).toContainEqual({ tag: "AI", count: 1 });
    // 赛道能量：成员归属 + 总粉丝
    const ai = stats.trackStats.find((t) => t.name === "AI工具");
    expect(ai).toMatchObject({ memberCount: 1, totalFollowers: 1500 });
    // 趋势：两个快照日，末日 = 1500 + 1300
    expect(stats.trend).toHaveLength(2);
    expect(stats.trend[1]).toEqual({ date: day2.slice(0, 10), total: 2800 });
    // 登阶 + 影响力指数
    expect(stats.recentMilestones).toHaveLength(1);
    const alice = stats.members.find((m) => m.id === "alice");
    expect(alice?.influence).toBeDefined();
    expect(alice?.posts30d).toBe(3);
    expect(alice?.mentionCount30d).toBe(0);
  });

  it("成员被提及计数来自 member_mentions 表", async () => {
    await seedMember("alice", "alice_x");
    await seedSnapshot("alice", 1000, new Date().toISOString());
    const at = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO member_mentions (member_id, tweet_id, author_handle, text, mentioned_at, collected_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind("alice", "t9", "outsider", "提到 alice", at, at).run();

    const stats = await getDashboardStats(env);
    expect(stats.members[0].mentionCount30d).toBe(1);
  });
});

describe("getDailyArchive", () => {
  it("指定统计日的总粉丝 / 登阶 / 声量 / 新成员数", async () => {
    await seedMember("alice", "alice_x", { joinedAt: "2026-08-01" });
    await seedMember("bob", "bob_x", { joinedAt: "2026-09-09" });
    await seedSnapshot("alice", 1000, "2026-09-08T05:00:00Z");
    await seedSnapshot("alice", 1100, "2026-09-09T05:00:00Z");
    await seedSnapshot("bob", 2500, "2026-09-09T06:00:00Z");
    await env.DB.prepare(
      "INSERT INTO milestones (member_id, threshold, achieved_at) VALUES (?, ?, ?)"
    ).bind("alice", 1000, "2026-09-09T03:00:00Z").run();
    await env.DB.prepare(
      "INSERT INTO mentions (keyword, author_handle, text, collected_at) VALUES (?, ?, ?, ?)"
    ).bind("KOSX", "fan1", "不错", "2026-09-09 10:00:00").run();
    await env.DB.prepare(
      "INSERT INTO mentions (keyword, author_handle, text, collected_at) VALUES (?, ?, ?, ?)"
    ).bind("KOSX", "fan2", "厉害", "2026-09-09 11:00:00").run();

    const a = await getDailyArchive(env, "2026-09-09");
    expect(a.totalFollowers).toBe(3600); // 截至当日各自最新快照：1100 + 2500
    expect(a.memberCount).toBe(2);
    expect(a.climbs).toHaveLength(1);
    expect(a.climbs[0]).toMatchObject({ handle: "alice_x", threshold: 1000 });
    expect(a.mentionsCount).toBe(2);
    expect(a.newJoins).toBe(1); // bob 当日加入
  });
});

describe("getAnnualReport", () => {
  it("YTD 增长 / 月度趋势 / 年度登阶", async () => {
    await seedMember("alice", "alice_x");
    await seedSnapshot("alice", 500, "2026-01-15T00:00:00Z");
    await seedSnapshot("alice", 3000, "2026-09-01T00:00:00Z");
    // 年前旧快照不进 YTD 窗口
    await seedSnapshot("alice", 100, "2025-12-20T00:00:00Z");
    await env.DB.prepare(
      "INSERT INTO milestones (member_id, threshold, achieved_at) VALUES (?, ?, ?)"
    ).bind("alice", 1000, "2026-02-01T00:00:00Z").run();

    const r = await getAnnualReport(env);
    expect(r.year).toBe(2026);
    expect(r.ytdGrowth).toBe(2500); // 500 → 3000
    expect(r.monthlyTrend).toEqual([
      { month: "2026-01", total: 500 },
      { month: "2026-09", total: 3000 },
    ]);
    expect(r.ytdClimbs).toBe(1);
    expect(r.ytdClimbsList[0]).toMatchObject({ threshold: 1000, handle: "alice_x" });
    expect(r.topGrowers[0]).toMatchObject({ handle: "alice_x", growth: 2500 });
  });
});

describe("getCommunitySignals", () => {
  it("按 kind 与 count 降序返回", async () => {
    const now = new Date().toISOString();
    const stmt = env.DB.prepare(
      "INSERT INTO community_signal_counts (kind, handle, name, count, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    await env.DB.batch([
      stmt.bind("following", "bigv_a", "大V甲", 5, now),
      stmt.bind("taste", "tool_x", null, 3, now),
      stmt.bind("following", "bigv_b", "大V乙", 2, now),
    ]);
    const rows = await getCommunitySignals(env);
    expect(rows).toEqual([
      { kind: "following", handle: "bigv_a", name: "大V甲", count: 5 },
      { kind: "following", handle: "bigv_b", name: "大V乙", count: 2 },
      { kind: "taste", handle: "tool_x", name: null, count: 3 },
    ]);
  });
});

describe("getContentRecipe", () => {
  // 统一把测试帖钉在北京时间 10 点（02:00Z），避免用默认 createdAt 时小时桶随机
  const atHour = (() => {
    const d = new Date(Date.now() - 2 * 86_400_000);
    d.setUTCHours(2, 0, 0, 0);
    return d.toISOString();
  })();

  it("北京时间小时桶聚合 + 形态分类（媒体优先，不再靠正文 t.co 判断）", async () => {
    await seedMember("alice", "alice_x");
    const longText = "这是一条没有链接的长文本帖。".repeat(10);
    // 带链接 3 帖（均值 100）、长文 3 帖（均值 300）
    for (let i = 0; i < 3; i++) {
      await seedPost("alice", `f${i}`, { createdAt: atHour, views: 100, text: `看这里 https://example.com/${i}` });
      await seedPost("alice", `g${i}`, { createdAt: atHour, views: 300, text: longText });
    }

    const r = await getContentRecipe(env);
    expect(r.hours).toEqual([{ hour: 10, count: 6, avgViews: 200 }]);
    const labels = r.forms.map((f) => f.label);
    expect(labels).toContain("带链接");
    expect(labels).toContain("长文");
    const link = r.forms.find((f) => f.label === "带链接");
    expect(link).toMatchObject({ count: 3, avgViews: 100 });
    // 互动率 = 互动合计/浏览；这批帖无互动 → 0
    expect(link!.engagementRate).toBe(0);
  });

  it("媒体帖按附件归类，不再因正文 t.co 误判成「带链接」", async () => {
    await seedMember("alice", "alice_x");
    // 纯图片帖：正文只有一条 t.co（X 的附件包裹形式）——旧口径会误判成「带链接」
    for (let i = 0; i < 3; i++) {
      await seedPost("alice", `m${i}`, { createdAt: atHour, views: 1000, text: "看这个 https://t.co/pic", media: [{ kind: "photo", url: "https://pbs.twimg.com/a.jpg" }] });
    }
    // 视频帖 3 条各带 50 赞：验证互动率池化
    for (let i = 0; i < 3; i++) {
      await seedPost("alice", `v${i}`, { createdAt: atHour, views: 1000, text: "视频 https://t.co/vid", media: [{ kind: "video", url: "https://pbs.twimg.com/v.jpg", videoUrl: "https://video.twimg.com/v.mp4" }], likes: 50 });
    }

    const r = await getContentRecipe(env);
    const labels = r.forms.map((f) => f.label);
    expect(labels).toContain("单图");
    expect(labels).not.toContain("带链接"); // 媒体帖全部归入媒体形态
    expect(r.forms.find((f) => f.label === "单图")).toMatchObject({ count: 3, avgViews: 1000 });
    expect(r.forms.find((f) => f.label === "视频")).toMatchObject({ count: 3, avgViews: 1000 });
    // 互动率池化：视频类 150/3000 = 0.05
    expect(r.forms.find((f) => f.label === "视频")!.engagementRate).toBeCloseTo(0.05);
  });

  it("多图与动图归类：>1 张照片算多图，动图并入视频", async () => {
    await seedMember("alice", "alice_x");
    for (let i = 0; i < 3; i++) {
      await seedPost("alice", `p${i}`, {
        createdAt: atHour,
        views: 500,
        text: "多图",
        media: [
          { kind: "photo", url: "https://pbs.twimg.com/1.jpg" },
          { kind: "photo", url: "https://pbs.twimg.com/2.jpg" },
        ],
      });
      await seedPost("alice", `a${i}`, { createdAt: atHour, views: 500, text: "动图", media: [{ kind: "gif", url: "https://pbs.twimg.com/g.jpg" }] });
    }

    const r = await getContentRecipe(env);
    const labels = r.forms.map((f) => f.label);
    expect(labels).toContain("多图");
    expect(labels).toContain("视频"); // gif 并入视频
    expect(r.forms.find((f) => f.label === "多图")).toMatchObject({ count: 3 });
    expect(r.forms.find((f) => f.label === "视频")).toMatchObject({ count: 3 });
    expect(labels).not.toContain("单图");
  });

  it("样本不足 3 条的形态不出（个位数样本均值是噪声）", async () => {
    await seedMember("alice", "alice_x");
    await seedPost("alice", "s1", { createdAt: atHour, views: 100, text: "短文本" });
    await seedPost("alice", "s2", { createdAt: atHour, views: 100, text: "短文本2" });

    const r = await getContentRecipe(env);
    expect(r.forms).toEqual([]); // 仅 2 帖，未达阈值
    expect(r.hours).toEqual([{ hour: 10, count: 2, avgViews: 100 }]); // 小时桶阈值是 2，照常出
  });

  it("回复与转推不计入配方（回复/转推是互动而非发布）", async () => {
    await seedMember("alice", "alice_x");
    await seedPost("alice", "r1", { createdAt: atHour, views: 99999, text: "回复", tweetType: "reply" });
    await seedPost("alice", "r2", { createdAt: atHour, views: 99999, text: "转推", tweetType: "retweet" });
    await seedPost("alice", "r3", { createdAt: atHour, views: 10, text: "原创" });
    await seedPost("alice", "r4", { createdAt: atHour, views: 10, text: "原创2" });

    const r = await getContentRecipe(env);
    // 若回复/转推被计入，均值会被 99999 拉高
    expect(r.hours.every((h) => h.avgViews <= 10)).toBe(true);
  });

  it("无浏览数的帖子不计入（本区块讲曝光）", async () => {
    await seedMember("alice", "alice_x");
    await seedPost("alice", "n1", { createdAt: atHour, views: null, text: "无浏览" });
    await seedPost("alice", "n2", { createdAt: atHour, views: 100, text: "有浏览" });
    await seedPost("alice", "n3", { createdAt: atHour, views: 200, text: "有浏览2" });

    const r = await getContentRecipe(env);
    expect(r.hours).toEqual([{ hour: 10, count: 2, avgViews: 150 }]);
  });
});
