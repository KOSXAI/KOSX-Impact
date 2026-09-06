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
    expect(stats).toEqual({
      followers: 1500,
      following: 120,
      posts: 42,
      displayName: "Alice",
      profileImageUrl: undefined,
      bio: null,
      location: null,
      url: null,
      bannerUrl: undefined,
      xCreatedAt: undefined,
      verified: false,
      listedCount: undefined,
      favouritesCount: undefined,
    });
  });

  it("档案字段全量解析：简介/地区/外链/横幅/X龄/认证/列表/点赞", async () => {
    const source = socialDataSource("test-key", (async () =>
      new Response(JSON.stringify({
        name: "Alice",
        followers_count: 1500,
        description: "KOSX 成员，创作者",
        location: "上海",
        url: "https://alice.example.com",
        profile_banner_url: "https://pbs.twimg.com/profile_banners/1/1500x500",
        created_at: "Wed May 12 08:00:00 +0000 2019",
        verified: true,
        listed_count: 37,
        favourites_count: 4200,
      }), { status: 200 })) as typeof fetch);

    const stats = await source.fetchStats("alice_x");
    expect(stats.bio).toBe("KOSX 成员，创作者");
    expect(stats.location).toBe("上海");
    expect(stats.url).toBe("https://alice.example.com");
    expect(stats.bannerUrl).toContain("profile_banners");
    expect(stats.xCreatedAt).toBe("Wed May 12 08:00:00 +0000 2019");
    expect(stats.verified).toBe(true);
    expect(stats.listedCount).toBe(37);
    expect(stats.favouritesCount).toBe(4200);
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
