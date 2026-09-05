import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import "../src/api-entry";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM refresh_queue").run();
  await env.DB.prepare("DELETE FROM daily_stats").run();
  await env.DB.prepare("DELETE FROM milestones").run();
  await env.DB.prepare("DELETE FROM snapshots").run();
  await env.DB.prepare("DELETE FROM members").run();
  await env.DB.prepare("DELETE FROM site_meta").run();
});

async function seedMember() {
  await env.DB.prepare(
    "INSERT INTO members (id, handle, display_name, joined_at) VALUES (?, ?, ?, ?)"
  ).bind("alice", "alice_x", "Alice", "2026-08-01").run();
  await env.DB.prepare(
    "INSERT INTO snapshots (member_id, followers, recorded_at) VALUES (?, ?, ?)"
  ).bind("alice", 1234, "2026-08-31T00:00:00Z").run();
}

describe("API", () => {
  it("GET /api/health 返回 ok", async () => {
    const res = await exports.default.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("GET /api/members 返回成员及最新粉丝量", async () => {
    await seedMember();
    const res = await exports.default.fetch("https://example.com/api/members");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: Array<Record<string, unknown>> };
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ handle: "alice_x", latest_followers: 1234 });
  });

  it("GET /api/members/:id 返回成长曲线与里程碑", async () => {
    await seedMember();
    await env.DB.prepare(
      "INSERT INTO milestones (member_id, threshold, achieved_at) VALUES (?, ?, ?)"
    ).bind("alice", 1000, "2026-08-20T00:00:00Z").run();

    const res = await exports.default.fetch("https://example.com/api/members/alice");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      member: { handle: string };
      snapshots: unknown[];
      milestones: Array<{ threshold: number }>;
    };
    expect(body.member.handle).toBe("alice_x");
    expect(body.snapshots).toHaveLength(1);
    expect(body.milestones).toHaveLength(1);
  });

  it("GET /api/members/:id 对未知成员返回 404", async () => {
    const res = await exports.default.fetch("https://example.com/api/members/nobody");
    expect(res.status).toBe(404);
  });

  it("GET /api/dashboard 返回看板统计（camelCase 派生字段）", async () => {
    await seedMember();
    const res = await exports.default.fetch("https://example.com/api/dashboard");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalFollowers: number;
      totalGrowth30d: number;
      tenKMembers: number;
      members: Array<{ handle: string; tierKey: string; nextTier: number; climbs: number }>;
      recentMilestones: unknown[];
    };
    expect(body.totalFollowers).toBe(1234);
    expect(body.totalGrowth30d).toBe(0);
    expect(body.tenKMembers).toBe(0);
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ handle: "alice_x", tierKey: "thousand", nextTier: 1500, climbs: 0 });
  });

  it("POST /api/refresh 未在册 handle 且无注册意图时返回 404", async () => {
    const res = await exports.default.fetch("https://example.com/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "newbie_x" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /api/refresh 带 register 意图直接建自助成员并入队", async () => {
    // 预占节流槽：CAS 抢不到 → 不触发真实采集，稳定返回 queued
    await env.DB.prepare("INSERT INTO site_meta (key, value) VALUES ('self_refresh_slot_at', ?)").bind(new Date().toISOString()).run();

    const res = await exports.default.fetch("https://example.com/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "x.com/Newbie_X", register: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; memberId: string };
    expect(body.memberId).toBe("newbie_x");
    expect(["done", "queued"]).toContain(body.status);

    const member = (await env.DB.prepare(
      "SELECT status, self_registered FROM members WHERE id = 'newbie_x'"
    ).first()) as { status: string; self_registered: number };
    expect(member).toMatchObject({ status: "active", self_registered: 1 });

    const job = (await env.DB.prepare(
      "SELECT status FROM refresh_queue WHERE member_id = 'newbie_x'"
    ).first()) as { status: string } | null;
    expect(job?.status).toBe("pending");
  });
});
