import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { RosterFile } from "../src/roster";
import { syncRoster } from "../src/roster";

const alice = {
  id: "alice",
  handle: "alice_x",
  displayName: "Alice",
  joinedAt: "2026-08-01",
  baselineFollowers: 1200,
};
const bob = { id: "bob", handle: "bob_x", joinedAt: "2026-08-02" };

function rosterOf(...members: RosterFile["members"]): RosterFile {
  return { members };
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM snapshots").run();
  await env.DB.prepare("DELETE FROM milestones").run();
  await env.DB.prepare("DELETE FROM members").run();
});

describe("syncRoster", () => {
  it("把名册成员写入 members 表并回填基线快照", async () => {
    await syncRoster(env, rosterOf(alice));

    const member = await env.DB.prepare("SELECT * FROM members WHERE id = 'alice'").first();
    expect(member).toMatchObject({
      handle: "alice_x",
      display_name: "Alice",
      status: "active",
      joined_at: "2026-08-01",
    });

    const snapshot = await env.DB.prepare(
      "SELECT followers, recorded_at FROM snapshots WHERE member_id = 'alice'"
    ).first();
    expect(snapshot).toMatchObject({ followers: 1200, recorded_at: "2026-08-01T00:00:00Z" });
  });

  it("重复同步不会重复回填基线", async () => {
    await syncRoster(env, rosterOf(alice));
    await syncRoster(env, rosterOf(alice));

    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM snapshots WHERE member_id = 'alice'"
    ).all();
    expect((results[0] as { n: number }).n).toBe(1);
  });

  it("名册中移除的成员标记为 removed，历史快照保留", async () => {
    await syncRoster(env, rosterOf(alice, bob));
    await syncRoster(env, rosterOf(alice));

    const removed = (await env.DB.prepare(
      "SELECT status FROM members WHERE id = 'bob'"
    ).first()) as { status: string };
    expect(removed.status).toBe("removed");

    const snapshots = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM snapshots WHERE member_id = 'bob'"
    ).first()) as { n: number };
    expect(snapshots.n).toBe(0);
  });

  it("再次加入名册会恢复为 active", async () => {
    await syncRoster(env, rosterOf(alice, bob));
    await syncRoster(env, rosterOf(alice));
    await syncRoster(env, rosterOf(alice, bob));

    const restored = (await env.DB.prepare(
      "SELECT status FROM members WHERE id = 'bob'"
    ).first()) as { status: string };
    expect(restored.status).toBe("active");
  });

  it("handle 改名时按 id 更新，不影响历史数据", async () => {
    await syncRoster(env, rosterOf(alice));
    await syncRoster(env, rosterOf({ ...alice, handle: "alice_new" }));

    const member = (await env.DB.prepare(
      "SELECT handle FROM members WHERE id = 'alice'"
    ).first()) as { handle: string };
    expect(member.handle).toBe("alice_new");
  });

  it("自助注册成员（self_registered=1）不被名册同步清扫，名册外普通成员仍被移除", async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at, self_registered) VALUES ('zoe', 'zoe_x', '2026-09-05', 1)"
    ).run();
    await env.DB.prepare(
      "INSERT INTO members (id, handle, joined_at, self_registered) VALUES ('ghost', 'ghost_x', '2026-09-05', 0)"
    ).run();

    await syncRoster(env, rosterOf(alice));

    const zoe = (await env.DB.prepare(
      "SELECT status FROM members WHERE id = 'zoe'"
    ).first()) as { status: string };
    expect(zoe.status).toBe("active");

    const ghost = (await env.DB.prepare(
      "SELECT status FROM members WHERE id = 'ghost'"
    ).first()) as { status: string };
    expect(ghost.status).toBe("removed");
  });
});
