import type { FollowerSource, FollowerStats } from "./types";

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
 * SocialData 数据源：按 username 查询用户公开资料。
 * 响应字段与 Twitter API v1.1 users/show 一致，文档：docs.socialdata.tools
 *
 * 内置节流：成员间保持约 20 秒间隔，使每日采集全部落在每分钟 3 次的免费额度内。
 */
export function socialDataSource(apiKey: string, fetchFn: FetchFn = fetch): FollowerSource {
  let lastRequestAt = 0;

  return {
    name: "socialdata",
    async fetchStats(handle: string): Promise<FollowerStats> {
      const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();

      const response = await fetchFn(`${API_BASE}/twitter/user/${encodeURIComponent(handle)}`, {
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
      const data = (await response.json()) as {
        name?: string;
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
      };
      if (typeof data.followers_count !== "number") {
        throw new SocialDataError(`响应缺少 followers_count：${JSON.stringify(data)}`);
      }
      return {
        followers: data.followers_count,
        following: data.friends_count,
        posts: data.statuses_count,
        displayName: data.name ?? null,
        profileImageUrl: data.profile_image_url_https,
        bio: data.description ?? null,
        location: data.location ?? null,
        url: data.url ?? null,
        bannerUrl: data.profile_banner_url,
        xCreatedAt: data.created_at,
        verified: data.verified === true,
        listedCount: typeof data.listed_count === "number" ? data.listed_count : undefined,
        favouritesCount: typeof data.favourites_count === "number" ? data.favourites_count : undefined,
      };
    },
  };
}
