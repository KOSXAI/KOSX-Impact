import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  enqueueRefresh,
  lookupRefreshMember,
  normalizeHandle,
  registerMember,
  tryGrabRefreshSlot,
} from "../src/refresh-queue";
import { drainRefreshQueue, processOldestPending } from "../src/collector";
import type { FollowerSource, FollowerStats } from "../src/sources/types";

const T0 = "2026-09-05T00:00:00.000Z";

function at(ms: number): string {
  return new Date(new Date(T0).getTime() + ms).toISOString();
}

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
  await env.DB.prepare("DELETE FROM refresh_queue").run();
  await env.DB.prepare("DELETE FROM daily_stats").run();
  await env.DB.prepare("DELETE FROM milestones").run();
  await env.DB.prepare("DELETE FROM snapshots").run();
  await env.DB.prepare("DELETE FROM members").run();
  await env.DB.prepare("DELETE FROM site_meta").run();
});

async function seedMember(id: string, handle: string, baseline: number, status = "active") {
  await env.DB.prepare(
    "INSERT INTO members (id, handle, joined_at, status) VALUES (?1, ?2, '2026-08-30', ?3)"
  ).bind(id, handle, status).run();
  await env.DB.prepare(
    "INSERT INTO snapshots (member_id, followers, recorded_at) VALUES (?1, ?2, '2026-08-30T00:00:00Z')"
  ).bind(id, baseline).run();
}

describe("normalizeHandle", () => {
  it("主页链接、@用户名、裸用户名统一归一化", () => {
    expect(normalizeHandle("https://x.com/alice_x")).toBe("alice_x");
    expect(normalizeHandle("x.com/alice_x?foo=bar")).toBe("alice_x");
    expect(normalizeHandle("https://mobile.x.com/Alice_X/status/123")).toBe("alice_x");
    expect(normalizeHandle("https://twitter.com/alice_x")).toBe("alice_x");
    expect(normalizeHandle("@Alice_X")).toBe("alice_x");
    expect(normalizeHandle("  alice_x  ")).toBe("alice_x");
  });

  it("非法输入返回 null", () => {
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle("   ")).toBeNull();
    expect(normalizeHandle("x.com/")).toBeNull();
    expect(normalizeHandle("含 中文")).toBeNull();
    expect(normalizeHandle("way_toolong_handle_16ch")).toBeNull();
    expect(normalizeHandle("not a url!")).toBeNull();
  });
});

describe("enqueueRefresh", () => {
  it("同一成员重复入队：防抖窗口内 throttled，窗口外由唯一索引合并", async () => {
    await seedMember("alice", "alice_x", 900);
    expect(await enqueueRefresh(env, "alice", T0)).toBe("enqueued");
    // 60 秒防抖窗口内先被 throttled 拦截（比去重更早）
    expect(await enqueueRefresh(env, "alice", at(30_000))).toBe("throttled");
    // 窗口外但上一条仍在 pending：部分唯一索引合并为 already_pending
    expect(await enqueueRefresh(env, "alice", at(61_000))).toBe("already_pending");
  });

  it("防抖窗口内重复提交返回 throttled，窗口后可再次入队", async () => {
    await seedMember("alice", "alice_x", 900);
    // 第一条：入队后由消费逻辑置 done
    await enqueueRefresh(env, "alice", T0);
    await env.DB.prepare(
      "UPDATE refresh_queue SET status = 'done', processed_at = ?2 WHERE member_id = 'alice'"
    ).bind("alice", at(1_000)).run();
    // 60 秒防抖窗口内：throttled
    expect(await enqueueRefresh(env, "alice", at(30_000))).toBe("throttled");
    // 窗口外：可再次入队
    expect(await enqueueRefresh(env, "alice", at(61_000))).toBe("enqueued");
  });
});

describe("tryGrabRefreshSlot", () => {
  it("CAS 保证最小 21 秒间隔，未到间隔的并发提交抢不到", async () => {
    expect(await tryGrabRefreshSlot(env, T0)).toBe(true);
    expect(await tryGrabRefreshSlot(env, at(20_000))).toBe(false);
    expect(await tryGrabRefreshSlot(env, at(21_000))).toBe(true);
    expect(await tryGrabRefreshSlot(env, at(41_000))).toBe(false);
  });
});

describe("drainRefreshQueue", () => {
  it("按 FIFO 消费 pending，走采集管线写快照/登阶/日统计并标记 done", async () => {
    await seedMember("alice", "alice_x", 900);
    await seedMember("bob", "bob_x", 1200);
    await enqueueRefresh(env, "bob", T0);
    await enqueueRefresh(env, "alice", at(1_000));

    const summary = await drainRefreshQueue(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }));

    expect(summary.ok).toBe(2);
    expect(summary.memberIds.sort()).toEqual(["alice", "bob"]);

    const aliceSnapshot = (await env.DB.prepare(
      "SELECT followers FROM snapshots WHERE member_id = 'alice' ORDER BY recorded_at DESC LIMIT 1"
    ).first()) as { followers: number };
    expect(aliceSnapshot.followers).toBe(1500);

    // 900 → 1500 跨过 1000 与 1500
    const { results: milestones } = await env.DB.prepare(
      "SELECT threshold FROM milestones WHERE member_id = 'alice' ORDER BY threshold"
    ).all();
    expect(milestones).toEqual([{ threshold: 1000 }, { threshold: 1500 }]);

    const aliceDaily = (await env.DB.prepare(
      "SELECT followers, growth FROM daily_stats WHERE member_id = 'alice'"
    ).first()) as { followers: number; growth: number };
    expect(aliceDaily.followers).toBe(1500);
    expect(aliceDaily.growth).toBe(600);

    const job = (await env.DB.prepare(
      "SELECT status, followers_after FROM refresh_queue WHERE member_id = 'alice'"
    ).first()) as { status: string; followers_after: number };
    expect(job.status).toBe("done");
    expect(job.followers_after).toBe(1500);
  });

  it("非 active 成员的请求标记 failed，不调用数据源", async () => {
    await seedMember("bob", "bob_x", 1200, "removed");
    await enqueueRefresh(env, "bob", T0);

    const summary = await drainRefreshQueue(env, stubSource({ bob_x: { followers: 9999 } }));
    expect(summary.ok).toBe(0);
    expect(summary.failed).toBe(1);

    const job = (await env.DB.prepare(
      "SELECT status, error FROM refresh_queue WHERE member_id = 'bob'"
    ).first()) as { status: string; error: string };
    expect(job.status).toBe("failed");
    expect(job.error).toContain("member not active");
  });

  it("数据源失败保留 pending 重试，累计 3 次转 failed", async () => {
    await seedMember("alice", "alice_x", 900);
    await enqueueRefresh(env, "alice", T0);
    const failing = stubSource({ alice_x: new Error("SocialData 请求失败（HTTP 503）") });

    const first = await drainRefreshQueue(env, failing);
    expect(first.ok).toBe(0);
    let job = (await env.DB.prepare(
      "SELECT status, attempts FROM refresh_queue WHERE member_id = 'alice'"
    ).first()) as { status: string; attempts: number };
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);

    await drainRefreshQueue(env, failing);
    await drainRefreshQueue(env, failing);
    job = (await env.DB.prepare(
      "SELECT status, attempts FROM refresh_queue WHERE member_id = 'alice'"
    ).first()) as { status: string; attempts: number };
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(3);
  });

  it("单次清空受 limit 限制，剩余留待下次", async () => {
    await seedMember("alice", "alice_x", 900);
    await seedMember("bob", "bob_x", 1200);
    await enqueueRefresh(env, "alice", T0);
    await enqueueRefresh(env, "bob", at(1_000));

    const summary = await drainRefreshQueue(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }), 1);

    expect(summary.ok).toBe(1);
    const { results: statuses } = await env.DB.prepare(
      "SELECT status FROM refresh_queue ORDER BY requested_at"
    ).all();
    expect(statuses).toEqual([{ status: "done" }, { status: "pending" }]);
  });
});

describe("processOldestPending", () => {
  it("即时通道只处理最旧一条，其余留在队列", async () => {
    await seedMember("alice", "alice_x", 900);
    await seedMember("bob", "bob_x", 1200);
    await enqueueRefresh(env, "alice", T0);
    await enqueueRefresh(env, "bob", at(1_000));

    const processed = await processOldestPending(env, stubSource({
      alice_x: { followers: 1500 },
      bob_x: { followers: 1300 },
    }));
    expect(processed).toBe(true);

    const { results: statuses } = await env.DB.prepare(
      "SELECT member_id, status FROM refresh_queue ORDER BY requested_at"
    ).all();
    expect(statuses).toEqual([
      { member_id: "alice", status: "done" },
      { member_id: "bob", status: "pending" },
    ]);
  });

  it("队列为空时不做任何事", async () => {
    expect(await processOldestPending(env, stubSource({}))).toBe(false);
  });
});

describe("registerMember", () => {
  it("新 handle 直接建自助成员（id=handle，self_registered=1）", async () => {
    await registerMember(env, "newbie_x", T0);
    const member = (await env.DB.prepare(
      "SELECT id, handle, status, self_registered, joined_at FROM members WHERE handle = 'newbie_x'"
    ).first()) as { id: string; handle: string; status: string; self_registered: number; joined_at: string };
    expect(member).toMatchObject({
      id: "newbie_x",
      handle: "newbie_x",
      status: "active",
      self_registered: 1,
      joined_at: "2026-09-05",
    });
  });

  it("已存在（含 removed）的成员重新提交则恢复 active 并标记自助", async () => {
    await seedMember("bob", "bob_x", 1200, "removed");
    await registerMember(env, "bob_x", T0);
    const member = (await env.DB.prepare(
      "SELECT status, self_registered FROM members WHERE id = 'bob'"
    ).first()) as { status: string; self_registered: number };
    expect(member).toMatchObject({ status: "active", self_registered: 1 });

    // 历史快照保留（未新增行）
    const snapshots = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM snapshots WHERE member_id = 'bob'"
    ).first()) as { n: number };
    expect(snapshots.n).toBe(1);
  });
});

describe("lookupRefreshMember", () => {
  it("返回预览数据与队列状态", async () => {
    await seedMember("alice", "alice_x", 900);
    const none = await lookupRefreshMember(env, "alice_x");
    expect(none).toMatchObject({
      id: "alice",
      handle: "alice_x",
      latestFollowers: 900,
      pending: false,
      tierKey: "seed",
      nextTier: 1000,
    });

    await enqueueRefresh(env, "alice", T0);
    const pending = await lookupRefreshMember(env, "x.com/alice_x");
    expect(pending?.pending).toBe(true);
  });

  it("大小写不敏感；非成员或已移除成员返回 null", async () => {
    await seedMember("alice", "alice_x", 900);
    expect(await lookupRefreshMember(env, "ALICE_X")).not.toBeNull();
    expect(await lookupRefreshMember(env, "stranger")).toBeNull();
  });
});
