import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { applyFollowerStats, collectWithSource } from "../src/collector";
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
  };
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM snapshots").run();
  await env.DB.prepare("DELETE FROM milestones").run();
  await env.DB.prepare("DELETE FROM daily_stats").run();
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

  it("滚动采集：daily_stats 预聚合随采集写入", async () => {
    await seedBaselines();
    await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 0);

    const stats = (await env.DB.prepare(
      "SELECT followers, growth, growth7d, growth30d FROM daily_stats WHERE member_id = 'alice'"
    ).first()) as { followers: number; growth: number; growth7d: number; growth30d: number };
    expect(stats.followers).toBe(1500);
    expect(stats.growth).toBe(600); // 900 → 1500
  });

  it("跨过阈值时写入登阶事件", async () => {
    await seedBaselines();
    // alice: 900 → 1500 跨过 1000 与 1500；bob: 1200 → 1300 无跨档
    await collectWithSource(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), testRoster, undefined, 0);

    const { results } = await env.DB.prepare(
      "SELECT member_id, threshold FROM milestones ORDER BY threshold"
    ).all();
    expect(results).toEqual([
      { member_id: "alice", threshold: 1000 },
      { member_id: "alice", threshold: 1500 },
    ]);
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

  it("applyFollowerStats：一次数据完整写管线（快照/登阶/日聚合 + cache_bust 递增）", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at, self_registered) VALUES ('alice', 'alice_x', '2026-08-30', 1)"
    ).run();
    await env.DB.prepare("DELETE FROM site_meta WHERE key = 'cache_bust'").run();

    await applyFollowerStats(env, "alice", { followers: 1500, displayName: "爱丽丝" }, "2026-09-05T04:00:00Z");

    const snapshot = (await env.DB.prepare(
      "SELECT followers FROM snapshots WHERE member_id = 'alice'"
    ).first()) as { followers: number };
    expect(snapshot.followers).toBe(1500);

    const daily = (await env.DB.prepare(
      "SELECT followers FROM daily_stats WHERE member_id = 'alice'"
    ).first()) as { followers: number };
    expect(daily.followers).toBe(1500);

    const member = (await env.DB.prepare(
      "SELECT display_name FROM members WHERE id = 'alice'"
    ).first()) as { display_name: string };
    expect(member.display_name).toBe("爱丽丝");

    const bust = (await env.DB.prepare(
      "SELECT CAST(value AS INTEGER) AS bust FROM site_meta WHERE key = 'cache_bust'"
    ).first()) as { bust: number };
    expect(bust.bust).toBe(1);

    // 再次写库：cache_bust 递增（缓存键换新）
    await applyFollowerStats(env, "alice", { followers: 1600 }, "2026-09-05T04:05:00Z");
    const bust2 = (await env.DB.prepare(
      "SELECT CAST(value AS INTEGER) AS bust FROM site_meta WHERE key = 'cache_bust'"
    ).first()) as { bust: number };
    expect(bust2.bust).toBe(2);
  });
});
