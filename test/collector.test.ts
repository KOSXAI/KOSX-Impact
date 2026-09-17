import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { applyFollowerStats, bumpCacheBust, collectWithSource, processOldestPending, shardMembersForHour } from "../src/collector";
import { SocialDataError } from "../src/sources/socialdata";
import type { RosterFile } from "../src/roster";
import type { FollowerSource, FollowerStats } from "../src/sources/types";

const testRoster: RosterFile = {
  members: [
    { id: "alice", handle: "alice_x", joinedAt: "2026-08-30" },
    { id: "bob", handle: "bob_x", joinedAt: "2026-08-30" },
  ],
};

function stubSource(stats: Record<string, FollowerStats | Error>): FollowerSource {
  return {
    name: "stub",
    async fetchStats(handle) {
      const value = stats[handle];
      if (value instanceof Error) throw value;
      return value;
    },
    // 帖子采集未被本测试断言：mock 返回空即可（stats 无 userId 时采集分支不触发）
    async fetchRecentPosts() {
      return [];
    },
  };
}

beforeEach(async () => {
  // 顺序有意义：refresh_queue 外键引用 members，先清子表
  await env.DB.prepare("DELETE FROM refresh_queue").run();
  await env.DB.prepare("DELETE FROM snapshots").run();
  await env.DB.prepare("DELETE FROM milestones").run();
  await env.DB.prepare("DELETE FROM posts").run();
  await env.DB.prepare("DELETE FROM site_meta").run();
  await env.DB.prepare("DELETE FROM members").run();
});

async function seedBaselines() {
  await env.DB.prepare(
    "INSERT INTO members (id, handle, joined_at) VALUES ('alice', 'alice_x', '2026-08-30'), ('bob', 'bob_x', '2026-08-30')"
  ).run();
  await env.DB.prepare(
    "INSERT INTO snapshots (member_id, followers, recorded_at) VALUES ('alice', 900, '2026-08-30T00:00:00Z'), ('bob', 1200, '2026-08-30T00:00:00Z')"
  ).run();
}

describe("shardMembersForHour", () => {
  const members = Array.from({ length: 48 }, (_, i) => ({ id: `member-${String(i).padStart(2, "0")}` }));

  it("分片无重叠无遗漏：每个 id 恰好落进一个槽", () => {
    const union = new Set<number>();
    let total = 0;
    for (let h = 0; h < 24; h++) {
      const shard = shardMembersForHour(members, h);
      total += shard.length;
      for (const m of shard) union.add(members.indexOf(m));
    }
    expect(total).toBe(48);
    expect(union.size).toBe(48); // 并集覆盖全体 = 无重叠无遗漏
  });

  it("负数小时取模归一（UTC 边界）", () => {
    const h0 = shardMembersForHour(members, 0);
    expect(shardMembersForHour(members, -24)).toEqual(h0);
  });
});

describe("collectWithSource", () => {
  it("滚动采集：各成员在其小时槽被采集并写入当日快照", async () => {
    await seedBaselines();
    // alice 在槽 0，bob 在槽 13
    const summaryA = await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 0);
    expect(summaryA.ok).toBe(1);
    expect(summaryA.shard).toEqual({ hourUtc: 0, eligible: 1, sampled: 1 });

    const summaryB = await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 13);
    expect(summaryB.ok).toBe(1);

    const latest = (await env.DB.prepare(
      "SELECT followers FROM snapshots WHERE member_id = 'alice' ORDER BY recorded_at DESC LIMIT 1"
    ).first()) as { followers: number };
    expect(latest.followers).toBe(1500);
    const latestBob = (await env.DB.prepare(
      "SELECT followers FROM snapshots WHERE member_id = 'bob' ORDER BY recorded_at DESC LIMIT 1"
    ).first()) as { followers: number };
    expect(latestBob.followers).toBe(1300);
  });

  it("一轮采集只换一次数据版本：多个成员写入不在各自快照里推进 cache_bust", async () => {
    // m1 与 m10 的分片槽同为 20（shardMembersForHour 的 id 哈希），
    // 一轮采集会连写两人，正好用来验证「一轮只 +1 而不是每成员 +1」
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at) VALUES ('m1','m1_x','2026-08-30'), ('m10','m10_x','2026-08-30')"
    ).run();
    await env.DB.prepare("DELETE FROM site_meta WHERE key = 'cache_bust'").run();
    const twoMemberRoster: RosterFile = {
      members: [
        { id: "m1", handle: "m1_x", joinedAt: "2026-08-30" },
        { id: "m10", handle: "m10_x", joinedAt: "2026-08-30" },
      ],
    };

    const summary = await collectWithSource(
      env,
      stubSource({ m1_x: { followers: 1500 }, m10_x: { followers: 1400 } }),
      twoMemberRoster,
      undefined,
      20
    );
    expect(summary.ok).toBe(2);

    // 关键：两名成员各写一次快照，但数据版本只 +1
    // （旧实现把 +1 放在 writeSnapshot 里，会变成 +2，把重缓存反复打掉重建）
    const bust = (await env.DB.prepare(
      "SELECT CAST(value AS INTEGER) AS bust FROM site_meta WHERE key = 'cache_bust'"
    ).first()) as { bust: number };
    expect(bust.bust).toBe(1);
  });

  it("profile 响应含 userId 时自动采集帖子（复用同一响应，零额外 profile 调用）", async () => {
    await seedBaselines();
    const source: FollowerSource = {
      name: "stub",
      async fetchStats() {
        return { followers: 1500, userId: "44196397" };
      },
      async fetchRecentPosts() {
        return [
          { tweetId: "t1", createdAt: "2026-09-05T00:00:00Z", fullText: "hi", views: 100, likes: 10, replies: 2, retweets: 1, quotes: 0, bookmarks: 3, lang: "zh", media: null, tweetType: "tweet", quoted: null },
          { tweetId: "t2", createdAt: "2026-09-06T00:00:00Z", fullText: null, views: null, likes: 5, replies: 0, retweets: 0, quotes: 0, bookmarks: 0, lang: null, media: null, tweetType: null, quoted: null },
        ];
      },
    };
    await collectWithSource(env, source, testRoster, undefined, 0);

    const { results: posts } = await env.DB.prepare(
      "SELECT tweet_id AS tweetId, views_count AS views FROM posts WHERE member_id = 'alice' ORDER BY created_at"
    ).all() as { results: Array<{ tweetId: string; views: number | null }> };
    expect(posts).toEqual([
      { tweetId: "t1", views: 100 },
      { tweetId: "t2", views: null },
    ]);
  });

  it("帖子附件媒体/类型/引用帖落库（JSON 列）", async () => {
    await seedBaselines();
    const source: FollowerSource = {
      name: "stub",
      async fetchStats() {
        return { followers: 1500, userId: "44196397" };
      },
      async fetchRecentPosts() {
        return [
          {
            tweetId: "m1",
            createdAt: "2026-09-07T00:00:00Z",
            fullText: "配图",
            views: 100,
            likes: 10,
            replies: 0,
            retweets: 0,
            quotes: 0,
            bookmarks: 0,
            lang: "zh",
            media: [{ kind: "photo", url: "https://pbs.twimg.com/media/x.jpg", tco: "https://t.co/x", videoUrl: null, width: 800, height: 600, durationMs: null }],
            tweetType: "tweet",
            quoted: null,
          },
          {
            tweetId: "m2",
            createdAt: "2026-09-08T00:00:00Z",
            fullText: "无媒体",
            views: 5,
            likes: 1,
            replies: 0,
            retweets: 0,
            quotes: 0,
            bookmarks: 0,
            lang: null,
            media: null,
            tweetType: "quote",
            quoted: { handle: "bob", name: "Bob", profileImage: null, text: "原文", url: "https://x.com/bob/status/1", media: null },
          },
        ];
      },
    };
    await collectWithSource(env, source, testRoster, undefined, 0);

    const { results } = await env.DB.prepare(
      "SELECT tweet_id AS tweetId, media, tweet_type AS tweetType, quoted FROM posts WHERE member_id = 'alice' ORDER BY created_at"
    ).all() as { results: Array<{ tweetId: string; media: string | null; tweetType: string | null; quoted: string | null }> };

    const m1 = results.find((r) => r.tweetId === "m1")!;
    expect(JSON.parse(m1.media!)).toEqual([{ kind: "photo", url: "https://pbs.twimg.com/media/x.jpg", tco: "https://t.co/x", videoUrl: null, width: 800, height: 600, durationMs: null }]);
    expect(m1.tweetType).toBe("tweet");
    expect(m1.quoted).toBeNull();

    const m2 = results.find((r) => r.tweetId === "m2")!;
    expect(m2.media).toBeNull();
    expect(m2.tweetType).toBe("quote");
    expect(JSON.parse(m2.quoted!)).toMatchObject({ handle: "bob", text: "原文" });
  });

  it("跨过阈值时写入登阶事件", async () => {
    await seedBaselines();
    // alice: 900 → 1500 跨过 1000（1500 不在新大关表上）；bob: 1200 → 1300 无跨关
    await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 0);

    const { results } = await env.DB.prepare(
      "SELECT member_id, threshold FROM milestones ORDER BY threshold"
    ).all();
    expect(results).toEqual([
      { member_id: "alice", threshold: 1000 },
    ]);
  });

  it("首个快照补授已达大关：中高粉成员加入即有徽章", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at) VALUES ('carol', 'carol_x', '2026-08-30')"
    ).run();
    // 无历史快照：3200 粉加入（注册当场校验走 applyFollowerStats）→ 百里挑一/五好青年/千帆竞发当场补授
    await applyFollowerStats(env, "carol", { followers: 3200 }, "2026-09-05T04:00:00Z");

    const { results } = await env.DB.prepare(
      "SELECT threshold FROM milestones WHERE member_id = 'carol' ORDER BY threshold"
    ).all();
    expect(results).toEqual([{ threshold: 100 }, { threshold: 500 }, { threshold: 1000 }]);

    // 下一次写入走跨线检测，不重复补授
    await applyFollowerStats(env, "carol", { followers: 3300 }, "2026-09-05T05:00:00Z");
    const total = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM milestones WHERE member_id = 'carol'"
    ).first()) as { n: number };
    expect(total.n).toBe(3);
  });

  it("部分成员失败不影响其他成员", async () => {
    await seedBaselines();
    const summaryA = await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 0);
    expect(summaryA.ok).toBe(1);
    expect(summaryA.failed).toHaveLength(0);

    const summaryB = await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: new Error("HTTP 404"),
    }), testRoster, undefined, 13);
    expect(summaryB.ok).toBe(0);
    expect(summaryB.failed).toHaveLength(1);
    expect(summaryB.failed[0]).toMatchObject({ handle: "bob_x", error: "HTTP 404" });
  });

  it("同一天重复采集只保留最新快照，且里程碑不重复", async () => {
    await seedBaselines();
    await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 0);
    await collectWithSource(env, stubSource({
      alice_x: { followers: 1600 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 0);

    const snapshots = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM snapshots WHERE member_id = 'alice'"
    ).first()) as { n: number };
    expect(snapshots.n).toBe(2); // 基线 + 当日一条

    const latest = (await env.DB.prepare(
      "SELECT followers FROM snapshots WHERE member_id = 'alice' ORDER BY recorded_at DESC LIMIT 1"
    ).first()) as { followers: number };
    expect(latest.followers).toBe(1600);

    const milestones = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM milestones WHERE member_id = 'alice' AND threshold = 1000"
    ).first()) as { n: number };
    expect(milestones.n).toBe(1);
  });

  it("applyFollowerStats：一次数据完整写管线（快照 + 档案回填，换键交给编排层）", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at, self_registered) VALUES ('alice', 'alice_x', '2026-08-30', 1)"
    ).run();
    await env.DB.prepare("DELETE FROM site_meta WHERE key = 'cache_bust'").run();

    await applyFollowerStats(env, "alice", {
      followers: 1500,
      displayName: "爱丽丝",
      bio: "KOSX 成员",
      location: "上海",
      url: "https://alice.example.com",
      bannerUrl: "https://pbs.twimg.com/profile_banners/1/1500x500",
      xCreatedAt: "Wed May 12 08:00:00 +0000 2019",
      verified: true,
      listedCount: 37,
      favouritesCount: 4200,
    }, "2026-09-05T04:00:00Z");

    const snapshot = (await env.DB.prepare(
      "SELECT followers, listed_count, favourites_count FROM snapshots WHERE member_id = 'alice'"
    ).first()) as { followers: number; listed_count: number; favourites_count: number };
    expect(snapshot.followers).toBe(1500);
    expect(snapshot.listed_count).toBe(37);
    expect(snapshot.favourites_count).toBe(4200);

    const member = (await env.DB.prepare(
      `SELECT display_name, bio, location, url, banner_url, x_created_at, verified
       FROM members WHERE id = 'alice'`
    ).first()) as {
      display_name: string; bio: string; location: string; url: string;
      banner_url: string; x_created_at: string; verified: number;
    };
    expect(member.display_name).toBe("爱丽丝");
    expect(member.bio).toBe("KOSX 成员");
    expect(member.location).toBe("上海");
    expect(member.url).toBe("https://alice.example.com");
    expect(member.banner_url).toContain("profile_banners");
    expect(member.x_created_at).toBe("Wed May 12 08:00:00 +0000 2019");
    expect(member.verified).toBe(1);

    // 数据版本不由单次写库推进：一轮采集内换一次键（bumpCacheBust 由编排层调用），
    // 否则每成员 +1 会把 dashboard/OG 卡等重缓存在一轮 cron 里反复打掉重建
    const bust = (await env.DB.prepare(
      "SELECT CAST(value AS INTEGER) AS bust FROM site_meta WHERE key = 'cache_bust'"
    ).first()) as { bust: number } | null;
    expect(bust?.bust ?? 0).toBe(0);

    // 再次写库：响应缺档案字段时不清空已有值
    await applyFollowerStats(env, "alice", { followers: 1600 }, "2026-09-05T04:05:00Z");
    const kept = (await env.DB.prepare(
      "SELECT bio, verified FROM members WHERE id = 'alice'"
    ).first()) as { bio: string; verified: number };
    expect(kept.bio).toBe("KOSX 成员");
    expect(kept.verified).toBe(1);

    // 编排层换键：显式调用一次才 +1
    await bumpCacheBust(env);
    const busted = (await env.DB.prepare(
      "SELECT CAST(value AS INTEGER) AS bust FROM site_meta WHERE key = 'cache_bust'"
    ).first()) as { bust: number };
    expect(busted.bust).toBe(1);
  });

  it("残缺响应不清空已有值：头像/次级计数保留旧值", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at) VALUES ('alice', 'alice_x', '2026-08-30')"
    ).run();
    // 首次：字段齐全
    await applyFollowerStats(env, "alice", {
      followers: 1500,
      profileImageUrl: "https://pbs.twimg.com/a.jpg",
      following: 120,
      posts: 42,
      listedCount: 37,
      favouritesCount: 4200,
    }, "2026-09-05T04:00:00Z");

    // 二次：响应缺字段（限流降级/结构变化）——库里旧值必须保留
    await applyFollowerStats(env, "alice", { followers: 1600 }, "2026-09-05T05:00:00Z");

    const member = (await env.DB.prepare(
      "SELECT profile_image FROM members WHERE id = 'alice'"
    ).first()) as { profile_image: string | null };
    expect(member.profile_image).toBe("https://pbs.twimg.com/a.jpg");

    const snap = (await env.DB.prepare(
      "SELECT following, posts, listed_count, favourites_count FROM snapshots WHERE member_id = 'alice' ORDER BY recorded_at DESC LIMIT 1"
    ).first()) as { following: number | null; posts: number | null; listed_count: number | null; favourites_count: number | null };
    expect(snap).toMatchObject({ following: 120, posts: 42, listed_count: 37, favourites_count: 4200 });
  });

  it("帖子二次采集：views 挪进 views_prev；本次缺 views 时两者都不动", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at) VALUES ('alice', 'alice_x', '2026-08-30')"
    ).run();
    const base = {
      tweetId: "t1", createdAt: "2026-09-05T00:00:00Z", fullText: "hi",
      likes: 10, replies: 1, retweets: 0, quotes: 0, bookmarks: 0, lang: "zh", media: null, tweetType: "tweet", quoted: null,
    };
    const source = (views: number | null): FollowerSource => ({
      name: "stub",
      async fetchStats() {
        return { followers: 1500, userId: "44196397" };
      },
      async fetchRecentPosts() {
        return [{ ...base, views }];
      },
    });

    await applyFollowerStats(env, "alice", { followers: 1500, userId: "44196397" }, "2026-09-05T04:00:00Z", source(1000));
    let row = (await env.DB.prepare(
      "SELECT views_count AS v, views_prev AS p FROM posts WHERE tweet_id = 't1'"
    ).first()) as { v: number | null; p: number | null };
    expect(row).toMatchObject({ v: 1000, p: null });

    // 第二次：1200 → 旧值 1000 挪进 views_prev（今日曝光增量的基线）
    await applyFollowerStats(env, "alice", { followers: 1500, userId: "44196397" }, "2026-09-05T05:00:00Z", source(1200));
    row = (await env.DB.prepare(
      "SELECT views_count AS v, views_prev AS p FROM posts WHERE tweet_id = 't1'"
    ).first()) as { v: number | null; p: number | null };
    expect(row).toMatchObject({ v: 1200, p: 1000 });

    // 第三次：本次响应缺 views（null）→ 好值保留，views_prev 不被重复挪动
    await applyFollowerStats(env, "alice", { followers: 1500, userId: "44196397" }, "2026-09-05T06:00:00Z", source(null));
    row = (await env.DB.prepare(
      "SELECT views_count AS v, views_prev AS p FROM posts WHERE tweet_id = 't1'"
    ).first()) as { v: number | null; p: number | null };
    expect(row).toMatchObject({ v: 1200, p: 1000 });
  });
});

describe("熔断与队列回收", () => {
  it("402 打开熔断；熔断期内 collect 与队列消费都不出站", async () => {
    await seedBaselines();
    // 让熔断处于打开状态（模拟刚吃过 402）
    await env.DB.prepare(
      "INSERT INTO site_meta (key, value) VALUES ('sd_circuit_open_until', ?)"
    ).bind(new Date(Date.now() + 3_600_000).toISOString()).run();

    let calls = 0;
    const source: FollowerSource = {
      name: "stub",
      async fetchStats() {
        calls++;
        return { followers: 1500 };
      },
      async fetchRecentPosts() {
        calls++;
        return [];
      },
    };

    const summary = await collectWithSource(env, source, testRoster, undefined, 0);
    expect(calls).toBe(0); // 分片采集全体跳过
    expect(summary.ok).toBe(0);

    // 即时通道同样不穿透熔断
    await env.DB.prepare(
      "INSERT INTO refresh_queue (member_id, status, requested_at) VALUES ('alice', 'pending', ?)"
    ).bind(new Date().toISOString()).run();
    const processed = await processOldestPending(env, source);
    expect(processed).toBe(false);
    expect(calls).toBe(0);
  });

  it("processRefreshJob 遇 402：留队待恢复 + 合闸", async () => {
    await seedBaselines();
    await env.DB.prepare("DELETE FROM site_meta WHERE key = 'sd_circuit_open_until'").run();
    await env.DB.prepare(
      "INSERT INTO refresh_queue (member_id, status, requested_at) VALUES ('alice', 'pending', ?)"
    ).bind(new Date().toISOString()).run();

    const source: FollowerSource = {
      name: "stub",
      async fetchStats() {
        throw new SocialDataError("payment required", 402);
      },
      async fetchRecentPosts() {
        return [];
      },
    };
    const ok = await processOldestPending(env, source);
    expect(ok).toBe(false);

    const job = (await env.DB.prepare(
      "SELECT status, error FROM refresh_queue WHERE member_id = 'alice' ORDER BY id DESC LIMIT 1"
    ).first()) as { status: string; error: string | null };
    expect(job.status).toBe("pending"); // 留队待恢复，不是 failed
    expect(job.error).toContain("额度");

    // 合闸生效：后续通道短路
    const breaker = await env.DB.prepare(
      "SELECT value FROM site_meta WHERE key = 'sd_circuit_open_until'"
    ).first();
    expect(breaker).not.toBeNull();
  });

  it("崩溃回收：卡死 processing 的 job 转 failed 且写 processed_at（否则永远删不掉）", async () => {
    await seedBaselines();
    // 一条 2 小时前领取、至今仍 processing 的 job
    await env.DB.prepare(
      `INSERT INTO refresh_queue (member_id, status, requested_at, processed_at)
       VALUES ('alice', 'processing', ?, NULL)`
    ).bind(new Date(Date.now() - 2 * 3600_000).toISOString()).run();

    // collect 会调用 pruneRefreshQueue（纯本地写，不依赖出站）
    await collectWithSource(env, stubSource({ alice_x: { followers: 1500 } }), testRoster, undefined, 0);

    const job = (await env.DB.prepare(
      "SELECT status, processed_at FROM refresh_queue WHERE member_id = 'alice' AND status = 'failed'"
    ).first()) as { status: string; processed_at: string | null } | null;
    expect(job).not.toBeNull();
    expect(job!.processed_at).not.toBeNull(); // 写了 processed_at，30 天清理才收得走
  });

  it("熔断分片提前收车：中途 402 后剩余成员不再尝试", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at) VALUES ('m1','m1_x','2026-08-30'), ('m10','m10_x','2026-08-30')"
    ).run();
    await env.DB.prepare("DELETE FROM site_meta WHERE key = 'sd_circuit_open_until'").run();
    const twoMemberRoster: RosterFile = {
      members: [
        { id: "m1", handle: "m1_x", joinedAt: "2026-08-30" },
        { id: "m10", handle: "m10_x", joinedAt: "2026-08-30" },
      ],
    };
    let calls = 0;
    const source: FollowerSource = {
      name: "stub",
      async fetchStats(handle) {
        calls++;
        if (handle === "m1_x") throw new SocialDataError("payment required", 402);
        return { followers: 1500 };
      },
      async fetchRecentPosts() {
        return [];
      },
    };

    const summary = await collectWithSource(env, source, twoMemberRoster, undefined, 20);
    expect(calls).toBe(1); // 第二个成员在熔断检查处被拦下，没有出站
    expect(summary.ok).toBe(0);
    expect(summary.failed).toHaveLength(1);
  });
});
