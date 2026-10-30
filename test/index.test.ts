import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/api-entry";
import { handleWorkerRoutes } from "../src/api";

beforeEach(async () => {
  // 全表清扫：后续用例会写 posts / mentions 等表，残留会串数据
  for (const t of [
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
  ]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
});

async function seedMember() {
  await env.DB.prepare(
    "INSERT INTO members (id, handle, display_name, joined_at) VALUES (?, ?, ?, ?)"
  ).bind("alice", "alice_x", "Alice", "2026-08-01").run();
  await env.DB.prepare(
    "INSERT INTO snapshots (member_id, followers, recorded_at) VALUES (?, ?, ?)"
  ).bind("alice", 1234, "2026-08-31T00:00:00Z").run();
}

/** POST /api/refresh helper：每个用例用独立 CF-Connecting-IP，避免逐个用例
 *  撞上 isolate 级频率闸门（限流本身另有专门用例覆盖）。 */
let ipSeq = 0;
function postRefresh(body: unknown, ip?: string) {
  return exports.default.fetch("https://example.com/api/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip ?? `10.0.0.${++ipSeq}` },
    body: JSON.stringify(body),
  });
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
    await env.DB.prepare(
      "UPDATE members SET bio = 'KOSX 成员', verified = 1 WHERE id = 'alice'"
    ).run();

    const res = await exports.default.fetch("https://example.com/api/members/alice");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      member: { handle: string };
      profile: { bio: string | null; verified: boolean };
      snapshots: unknown[];
      milestones: Array<{ threshold: number }>;
    };
    expect(body.member.handle).toBe("alice_x");
    expect(body.profile.bio).toBe("KOSX 成员");
    expect(body.profile.verified).toBe(true);
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
      members: Array<{ handle: string; tierKey: string; nextMilestone: number; climbs: number }>;
      recentMilestones: unknown[];
    };
    expect(body.totalFollowers).toBe(1234);
    expect(body.totalGrowth30d).toBe(0);
    expect(body.tenKMembers).toBe(0);
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ handle: "alice_x", tierKey: "thousand", nextMilestone: 5000, climbs: 0 });
  });

  it("POST /api/refresh 未在册 handle 且无注册意图时返回 404", async () => {
    const res = await postRefresh({ input: "newbie_x" });
    expect(res.status).toBe(404);
  });

  it("POST /api/refresh 带 register 意图：抢不到节流槽时不建行（宁可不注册也不留脏 handle）", async () => {
    // 预占节流槽：CAS 抢不到 → 没有做存在性校验的机会 → 必须拒绝，而不是先建行
    await env.DB.prepare("INSERT INTO site_meta (key, value) VALUES ('self_refresh_slot_at', ?)").bind(new Date().toISOString()).run();

    const res = await postRefresh({ input: "x.com/Newbie_X", register: true });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("busy");

    const member = await env.DB.prepare("SELECT id FROM members WHERE id = 'newbie_x'").first();
    expect(member).toBeNull();
  });

  it("POST /api/refresh 抢到槽且账号存在：注册 + 当场写库（done）", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      // 不带 id_str：避免触发帖子采集分支（数据源内置 20 秒节流会让用例超时）
      return new Response(JSON.stringify({ followers_count: 1234, name: "Newbie" }), { status: 200 });
    });
    try {
      const res = await postRefresh({ input: "x.com/Newbie_X", register: true });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; memberId: string; followersAfter: number };
      expect(body.status).toBe("done"); // 抢到槽 = 当场校验并写库
      expect(body.memberId).toBe("newbie_x");
      expect(body.followersAfter).toBe(1234);
      // 校验确实发生过（存在性校验 = 至少一次出站调用）
      expect(calls.some((u) => u.includes("/twitter/user/newbie_x"))).toBe(true);

      const member = (await env.DB.prepare("SELECT status, self_registered FROM members WHERE id = 'newbie_x'").first()) as {
        status: string;
        self_registered: number;
      };
      expect(member).toMatchObject({ status: "active", self_registered: 1 });

      // 当场入库：快照已写
      const snap = (await env.DB.prepare(
        "SELECT followers FROM snapshots WHERE member_id = 'newbie_x'"
      ).first()) as { followers: number } | null;
      expect(snap?.followers).toBe(1234);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("POST /api/refresh 账号不存在：拒绝注册且不建行（脏 handle 进不了名单）", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    try {
      const res = await postRefresh({ input: "ghost_x", register: true });
      expect(res.status).toBe(422);
      const member = await env.DB.prepare("SELECT id FROM members WHERE id = 'ghost_x'").first();
      expect(member).toBeNull();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("POST /api/refresh 上游额度受限（402）：合闸 + 拒绝注册，不降级建行", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async () => new Response("payment required", { status: 402 }));
    try {
      const res = await postRefresh({ input: "paid_x", register: true });
      expect(res.status).toBe(503);
      const member = await env.DB.prepare("SELECT id FROM members WHERE id = 'paid_x'").first();
      expect(member).toBeNull();

      // 熔断已合闸：冷却期内不再出站
      const breaker = await env.DB.prepare(
        "SELECT value FROM site_meta WHERE key = 'sd_circuit_open_until'"
      ).first();
      expect(breaker).not.toBeNull();

      const second = await postRefresh({ input: "other_x", register: true });
      expect(second.status).toBe(503); // 熔断打开：直接 503，连尝试都不尝试
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("POST /api/refresh 已被人为移除的成员（status_locked）拒绝复活", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at, status, status_locked) VALUES ('gone_x', 'gone_x', '2026-08-01', 'removed', 1)"
    ).run();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ id_str: "9", followers_count: 500 }), { status: 200 })
    );
    try {
      const res = await postRefresh({ input: "gone_x", register: true });
      expect(res.status).toBe(403);
      const member = (await env.DB.prepare("SELECT status FROM members WHERE id = 'gone_x'").first()) as { status: string };
      expect(member.status).toBe("removed"); // 人为状态不被匿名请求推翻
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("POST /api/refresh 每日注册名额触顶：429 且不建行", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT INTO site_meta (key, value) VALUES (?, '20')")
      .bind(`register_count:${today}`)
      .run();

    const res = await postRefresh({ input: "capped_x", register: true });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("register_cap_reached");
    const member = await env.DB.prepare("SELECT id FROM members WHERE id = 'capped_x'").first();
    expect(member).toBeNull();
  });

  it("POST /api/invite 拒绝自我邀请且不重复计数", async () => {
    await seedMember();
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at) VALUES ('bob', 'bob_x', '2026-08-02')"
    ).run();

    const self = await exports.default.fetch("https://example.com/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviterId: "alice", invitedMemberId: "alice" }),
    });
    expect(self.status).toBe(400);

    const ok1 = await exports.default.fetch("https://example.com/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviterId: "alice", invitedMemberId: "bob" }),
    });
    expect(ok1.status).toBe(200);
    const ok2 = await exports.default.fetch("https://example.com/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviterId: "alice", invitedMemberId: "bob" }),
    });
    expect(ok2.status).toBe(200);
    const count = (await env.DB.prepare("SELECT COUNT(*) AS n FROM invite_events").first()) as { n: number };
    expect(count.n).toBe(1); // 幂等：同一对只计一次
  });

  it("POST /api/refresh 单 IP 频率闸门：超过每分钟额度返回 429", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 10; i++) {
      const res = await postRefresh({ input: "nobody_x" }, ip);
      expect(res.status).toBe(404); // 前 10 次放行（未在册且无注册意图）
    }
    const blocked = await postRefresh({ input: "nobody_x" }, ip);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("too_many_requests");
  });

  it("GET /card 非法 id（路径穿越形态）返回 404 卡，不污染其他缓存槽", async () => {
    // 走 handleWorkerRoutes（真实分发），api-entry 只挂 Hono，/card 不在其中
    const res = await handleWorkerRoutes(new Request("https://example.com/card/..%2F..%2Fog.svg"), env);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    expect(res!.headers.get("Content-Type")).toContain("image/svg+xml");
  });

  it("GET /og/tracks 非白名单 slug 返回 404", async () => {
    const res = await handleWorkerRoutes(new Request("https://example.com/og/tracks/not-a-track.png"), env);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it("GET /card 合法 id 但成员不存在：返回 404 卡（哨兵）", async () => {
    const res = await handleWorkerRoutes(new Request("https://example.com/card/nobody.svg"), env);
    expect(res!.status).toBe(404);
    expect(await res!.text()).toContain("svg");
  });
});
