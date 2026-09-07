import type { FollowerSource, FollowerStats, PostData } from "./types";

const API_BASE = "https://api.socialdata.tools";

/** SocialData 公平使用政策：每分钟前 3 次请求免费，超出按 $0.0002/次计费 */
const FREE_REQUESTS_PER_MINUTE = 3;
const MIN_INTERVAL_MS = 61_000 / FREE_REQUESTS_PER_MINUTE;

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class SocialDataError extends Error {
  /** HTTP 状态码；网络/解析类错误为 0 */
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "SocialDataError";
    this.status = status;
  }
}

/**
 * SocialData 数据源：按 username 查询用户公开资料 + 按数字 ID 拉最近帖子。
 * 响应字段与 Twitter API v1.1 users/show 一致，文档：docs.socialdata.tools
 *
 * 内置节流：成员间保持约 20 秒间隔，使每日采集全部落在每分钟 3 次的免费额度内。
 *
 * 效率关键：profile 响应携带 id_str（数字用户 ID），帖子端点只认数字 ID——
 * 每日采集复用同一响应，不需要额外的 profile 调用。
 */
export function socialDataSource(apiKey: string, fetchFn: FetchFn = fetch): FollowerSource {
  let lastRequestAt = 0;

  /** 节流后的 GET 请求：失败抛 SocialDataError（透传 status，供 402/404/429 分流） */
  async function get<T>(path: string): Promise<T> {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();

    const response = await fetchFn(`${API_BASE}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      throw new SocialDataError(
        `SocialData 请求失败（HTTP ${response.status}）：${await response.text()}`,
        response.status
      );
    }
    return response.json() as Promise<T>;
  }

  return {
    name: "socialdata",
    async fetchStats(handle: string): Promise<FollowerStats> {
      const data = await get<{
        name?: string;
        id_str?: string;
        followers_count?: number;
        friends_count?: number;
        statuses_count?: number;
        profile_image_url_https?: string;
        description?: string;
        location?: string;
        url?: string | null;
        profile_banner_url?: string;
        created_at?: string;
        verified?: boolean;
        listed_count?: number;
        favourites_count?: number;
      }>(`/twitter/user/${encodeURIComponent(handle)}`);
      if (typeof data.followers_count !== "number") {
        throw new SocialDataError(`响应缺少 followers_count：${JSON.stringify(data)}`);
      }
      return {
        followers: data.followers_count,
        following: data.friends_count,
        posts: data.statuses_count,
        userId: data.id_str,
        displayName: data.name ?? null,
        profileImageUrl: data.profile_image_url_https,
        bio: data.description ?? null,
        location: data.location ?? null,
        url: data.url ?? null,
        bannerUrl: data.profile_banner_url,
        xCreatedAt: data.created_at,
        // 缺字段时保持 undefined（写成 false 会把库里的已认证覆盖掉，COALESCE 保护失效）
        verified: typeof data.verified === "boolean" ? data.verified : undefined,
        listedCount: typeof data.listed_count === "number" ? data.listed_count : undefined,
        favouritesCount: typeof data.favourites_count === "number" ? data.favourites_count : undefined,
      };
    },

    async fetchRecentPosts(userId: string): Promise<PostData[]> {
      const data = await get<{ tweets?: Array<{
        id_str?: string;
        tweet_created_at?: string;
        full_text?: string | null;
        views_count?: number | null;
        favorite_count?: number | null;
        reply_count?: number | null;
        retweet_count?: number | null;
        quote_count?: number | null;
        bookmark_count?: number | null;
        lang?: string | null;
      }> }>(`/twitter/user/${encodeURIComponent(userId)}/tweets`);
      const tweets = Array.isArray(data.tweets) ? data.tweets : [];
      return tweets
        .filter((t) => t.id_str)
        .map((t) => ({
          tweetId: t.id_str!,
          createdAt: t.tweet_created_at ?? new Date(0).toISOString(),
          fullText: t.full_text ?? null,
          views: typeof t.views_count === "number" ? t.views_count : null,
          likes: typeof t.favorite_count === "number" ? t.favorite_count : null,
          replies: typeof t.reply_count === "number" ? t.reply_count : null,
          retweets: typeof t.retweet_count === "number" ? t.retweet_count : null,
          quotes: typeof t.quote_count === "number" ? t.quote_count : null,
          bookmarks: typeof t.bookmark_count === "number" ? t.bookmark_count : null,
          lang: t.lang ?? null,
        }));
    },
  };
}