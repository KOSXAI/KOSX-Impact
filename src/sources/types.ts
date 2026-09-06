/** 一次采集得到的成员公开数据 */
export interface FollowerStats {
  followers: number;
  following?: number;
  posts?: number;
  /** X 公开昵称（自助注册成员的显示名来源；名册成员 display_name 以名册为准） */
  displayName?: string | null;
  /** X 公开头像 URL（pbs.twimg.com），无头像时缺省 */
  profileImageUrl?: string;
  /** X 简介（bio，自由文本） */
  bio?: string | null;
  /** 地区（X 资料自由文本，可能是 emoji/国旗） */
  location?: string | null;
  /** 资料里的主页外链 */
  url?: string | null;
  /** 横幅图 URL（pbs.twimg.com，档案页 hero） */
  bannerUrl?: string | null;
  /** X 账号创建时间（ISO 8601） */
  xCreatedAt?: string | null;
  /** 是否认证账号 */
  verified?: boolean;
  /** 被列表收录数（独立于粉丝量的策展型影响力信号） */
  listedCount?: number;
  /** 该账号发出的点赞数（活跃度信号） */
  favouritesCount?: number;
}

/**
 * 数据源抽象：未来接入官方 X API / 成员 OAuth 时实现同一接口即可，
 * 采集与展示逻辑不变。
 */
export interface FollowerSource {
  readonly name: string;
  fetchStats(handle: string): Promise<FollowerStats>;
}
