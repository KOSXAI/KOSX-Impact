/** 一次采集得到的成员公开数据 */
export interface FollowerStats {
  followers: number;
  following?: number;
  posts?: number;
  /** X 公开头像 URL（pbs.twimg.com），无头像时缺省 */
  profileImageUrl?: string;
}

/**
 * 数据源抽象：未来接入官方 X API / 成员 OAuth 时实现同一接口即可，
 * 采集与展示逻辑不变。
 */
export interface FollowerSource {
  readonly name: string;
  fetchStats(handle: string): Promise<FollowerStats>;
}
