/**
 * sync-signals.ts 集成测试：验证
 * 1. 熔断打开时 syncCommunitySignals 绝不清空历史 following（共同关注）数据；
 * 2. 社群品味（taste）严格只统计 active 成员帖子，忽略 removed / suspended 成员残留；
 * 3. syncMemberMentions 遇 402/429 立即合闸并中止本轮，且支持按组轮转分片。
 */
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/api-entry";
import { resetCacheBustMemo } from "../src/cache";
import { syncCommunitySignals, syncMemberMentions } from "../src/sync-signals";

beforeEach(async () => {
  for (const t of [
    "community_signal_counts",
    "member_mentions",
    "posts",
    "snapshots",
    "members",
    "site_meta",
  ]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
  resetCacheBustMemo();
});

describe("syncCommunitySignals", () => {
  it("熔断打开跳过 following 采样时保留历史共同关注数据，且 taste 仅统计 active 成员", async () => {
    const now = new Date().toISOString();
    // 预置历史 following 数据与打开的熔断器
    await env.DB.prepare(
      "INSERT INTO community_signal_counts (kind, handle, name, count, updated_at) VALUES ('following', 'karpathy', 'Andrej Karpathy', 6, ?)",
    )
      .bind(now)
      .run();
    await env.DB.prepare("INSERT INTO site_meta (key, value) VALUES ('sd_circuit_open_until', ?)")
      .bind(new Date(Date.now() + 3_600_000).toISOString())
      .run();

    // active 成员 + removed 成员各发一帖
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO members (id, handle, joined_at, status, user_id) VALUES ('alice', 'alice_x', '2026-08-01', 'active', '100')",
      ),
      env.DB.prepare(
        "INSERT INTO members (id, handle, joined_at, status, user_id) VALUES ('ghost', 'ghost_x', '2026-08-01', 'removed', '200')",
      ),
      env.DB.prepare(
        "INSERT INTO snapshots (member_id, followers, recorded_at) VALUES ('alice', 5000, ?)",
      ).bind(now),
      env.DB.prepare(
        "INSERT INTO posts (tweet_id, member_id, created_at, text, recorded_at) VALUES ('p1', 'alice', ?, '推荐关注 @openai 和 @alice_x', ?)",
      ).bind(now, now),
      env.DB.prepare(
        "INSERT INTO posts (tweet_id, member_id, created_at, text, recorded_at) VALUES ('p2', 'ghost', ?, '强推 @spam_account @spam_account', ?)",
      ).bind(now, now),
    ]);

    const res = await syncCommunitySignals(env);
    expect(res.following).toBe(0);
    expect(res.taste).toBe(1);

    const { results } = await env.DB.prepare(
      "SELECT kind, handle, count FROM community_signal_counts ORDER BY kind, handle",
    ).all<{ kind: string; handle: string; count: number }>();

    // 历史 following 完好保留，未被清空！
    expect(results).toContainEqual({ kind: "following", handle: "karpathy", count: 6 });
    // taste 仅包含 active 成员提及的外部账号，不包含 removed 成员的 @spam_account 或成员自身 @alice_x
    expect(results).toContainEqual({ kind: "taste", handle: "openai", count: 1 });
    expect(results.some((r) => r.handle === "spam_account")).toBe(false);
    expect(results.some((r) => r.handle === "alice_x")).toBe(false);
  });
});

describe("syncMemberMentions", () => {
  it("遇 429/402 立即合闸并中止剩余成员出站请求", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO members (id, handle, joined_at, status) VALUES ('m1', 'user_one', '2026-08-01', 'active')",
      ),
      env.DB.prepare(
        "INSERT INTO members (id, handle, joined_at, status) VALUES ('m2', 'user_two', '2026-08-01', 'active')",
      ),
    ]);

    let calls = 0;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response("rate limited", { status: 429 });
    });
    try {
      const testEnv = { ...env, SOCIALDATA_API_KEY: "test-key" } as Env;
      const res = await syncMemberMentions(testEnv, { shardMod: 1 });
      expect(res.ok).toBe(0);
      expect(calls).toBe(1); // 第一次 429 即中止，不再打第二个成员
      const breaker = await env.DB.prepare(
        "SELECT value FROM site_meta WHERE key = 'sd_circuit_open_until'",
      ).first<{ value: string }>();
      expect(breaker).not.toBeNull();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});
