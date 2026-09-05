import { describe, expect, it } from "vitest";
import { socialDataSource } from "../../src/sources/socialdata";

describe("socialDataSource", () => {
  it("按 username 查询、携带 Bearer 鉴权并解析字段", async () => {
    const calls: string[] = [];
    const headers: Record<string, string> = {};
    const source = socialDataSource("test-key", (async (input, init) => {
      calls.push(String(input));
      Object.assign(headers, init?.headers ?? {});
      return new Response(JSON.stringify({
        screen_name: "alice_x",
        name: "Alice",
        followers_count: 1500,
        friends_count: 120,
        statuses_count: 42,
      }), { status: 200 });
    }) as typeof fetch);

    const stats = await source.fetchStats("alice_x");

    expect(calls).toEqual(["https://api.socialdata.tools/twitter/user/alice_x"]);
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(stats).toEqual({ followers: 1500, following: 120, posts: 42, displayName: "Alice" });
  });

  it("非 200 响应抛出错误", async () => {
    const source = socialDataSource("test-key", (async () =>
      new Response("not found", { status: 404 })) as typeof fetch);
    await expect(source.fetchStats("nobody")).rejects.toThrow("HTTP 404");
  });

  it("响应缺少 followers_count 时抛出错误", async () => {
    const source = socialDataSource("test-key", (async () =>
      new Response("{}", { status: 200 })) as typeof fetch);
    await expect(source.fetchStats("alice_x")).rejects.toThrow("followers_count");
  });
});
