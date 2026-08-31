import type { FollowerSource, FollowerStats } from "./types";

const API_BASE = "https://api.socialdata.tools";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class SocialDataError extends Error {}

/**
 * SocialData 数据源：按 username 查询用户公开资料。
 * 响应字段与 Twitter API v1.1 users/show 一致，文档：docs.socialdata.tools
 */
export function socialDataSource(apiKey: string, fetchFn: FetchFn = fetch): FollowerSource {
  return {
    name: "socialdata",
    async fetchStats(handle: string): Promise<FollowerStats> {
      const response = await fetchFn(`${API_BASE}/twitter/user/${encodeURIComponent(handle)}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) {
        throw new SocialDataError(
          `SocialData 请求失败（HTTP ${response.status}）：${await response.text()}`
        );
      }
      const data = (await response.json()) as {
        followers_count?: number;
        friends_count?: number;
        statuses_count?: number;
      };
      if (typeof data.followers_count !== "number") {
        throw new SocialDataError(`响应缺少 followers_count：${JSON.stringify(data)}`);
      }
      return {
        followers: data.followers_count,
        following: data.friends_count,
        posts: data.statuses_count,
      };
    },
  };
}
