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
        id_str: "44196397",
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
      userId: "44196397",
      displayName: "Alice",
      profileImageUrl: undefined,
      bio: null,
      location: null,
      url: null,
      bannerUrl: undefined,
      xCreatedAt: undefined,
      // 缺字段保持 undefined（不写 false），COALESCE 才能保住库里的旧值
      verified: undefined,
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

  it("fetchRecentPosts 按数字 ID 拉取并解析互动字段", async () => {
    const calls: string[] = [];
    const source = socialDataSource("test-key", (async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({
        tweets: [
          {
            id_str: "1001",
            tweet_created_at: "2026-09-01T00:00:00.000Z",
            full_text: "hello world",
            views_count: 5000,
            favorite_count: 88,
            reply_count: 12,
            retweet_count: 3,
            quote_count: 1,
            bookmark_count: 7,
            lang: "zh",
          },
          { id_str: "1002", full_text: null, views_count: null },
        ],
      }), { status: 200 });
    }) as typeof fetch);

    const posts = await source.fetchRecentPosts("44196397");

    expect(calls).toEqual(["https://api.socialdata.tools/twitter/user/44196397/tweets"]);
    expect(posts).toEqual([
      {
        tweetId: "1001",
        createdAt: "2026-09-01T00:00:00.000Z",
        fullText: "hello world",
        views: 5000,
        likes: 88,
        replies: 12,
        retweets: 3,
        quotes: 1,
        bookmarks: 7,
        lang: "zh",
        media: null,
        tweetType: null,
        quoted: null,
      },
      { tweetId: "1002", createdAt: "1970-01-01T00:00:00.000Z", fullText: null, views: null, likes: null, replies: null, retweets: null, quotes: null, bookmarks: null, lang: null, media: null, tweetType: null, quoted: null },
    ]);
  });

  it("解析附件媒体：照片带尺寸、视频取最高码率 mp4 直链、t.co 保留", async () => {
    const source = socialDataSource("test-key", (async () =>
      new Response(JSON.stringify({
        tweets: [
          {
            id_str: "2001",
            tweet_created_at: "2026-09-02T00:00:00.000Z",
            full_text: "看图 https://t.co/pic",
            type: "tweet",
            extended_entities: {
              media: [
                { type: "photo", media_url_https: "https://pbs.twimg.com/media/a.jpg", url: "https://t.co/pic", original_info: { width: 1200, height: 900 } },
                { type: "video", media_url_https: "https://pbs.twimg.com/thumb.jpg", url: "https://t.co/vid", original_info: { width: 720, height: 1280 }, video_info: { duration_millis: 54100, variants: [
                  { content_type: "application/x-mpegURL", url: "https://video.twimg.com/x.m3u8" },
                  { content_type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/lo.mp4" },
                  { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/hi.mp4" },
                ] } },
              ],
            },
          },
        ],
      }), { status: 200 })) as typeof fetch);

    const [post] = await source.fetchRecentPosts("44196397");
    expect(post.tweetType).toBe("tweet");
    expect(post.media).toEqual([
      { kind: "photo", url: "https://pbs.twimg.com/media/a.jpg", tco: "https://t.co/pic", videoUrl: null, width: 1200, height: 900, durationMs: null },
      { kind: "video", url: "https://pbs.twimg.com/thumb.jpg", tco: "https://t.co/vid", videoUrl: "https://video.twimg.com/hi.mp4", width: 720, height: 1280, durationMs: 54100 },
    ]);
  });

  it("解析引用帖：内嵌原文卡含作者/正文/外链/首图", async () => {
    const source = socialDataSource("test-key", (async () =>
      new Response(JSON.stringify({
        tweets: [
          {
            id_str: "3001",
            type: "quote",
            full_text: "同意",
            is_quote_status: true,
            quoted_status: {
              id_str: "2999",
              full_text: "原文正文",
              user: { screen_name: "bob_x", name: "Bob", profile_image_url_https: "https://pbs.twimg.com/bob.jpg" },
              entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/q.jpg" }] },
            },
          },
        ],
      }), { status: 200 })) as typeof fetch);

    const [post] = await source.fetchRecentPosts("44196397");
    expect(post.tweetType).toBe("quote");
    expect(post.quoted).toEqual({
      handle: "bob_x",
      name: "Bob",
      profileImage: "https://pbs.twimg.com/bob.jpg",
      text: "原文正文",
      url: "https://x.com/bob_x/status/2999",
      media: { kind: "photo", url: "https://pbs.twimg.com/media/q.jpg", tco: null, videoUrl: null, width: null, height: null, durationMs: null },
    });
  });
});
