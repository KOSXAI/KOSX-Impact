/** 一次采集得到的成员公开数据 */
export interface FollowerStats {
  followers: number;
  following?: number;
  posts?: number;
  /** X 数字用户 ID（id_str）：帖子端点只认数字 ID，profile 响应天然携带，复用免额外调用 */
  userId?: string;
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

/** 帖子附件媒体（照片/视频/GIF）：展示层直出，无需再请求 X */
export interface PostMedia {
  kind: "photo" | "video" | "gif";
  /** 封面图 URL（视频/GIF 为封面帧，照片为原图） */
  url: string;
  /** 正文里对应的 t.co 短链（展示层据此从「查看链接」里剔除，避免与图片重复） */
  tco?: string | null;
  /** 视频最优 mp4 直链（video.twimg.com，可热链播放）；照片/GIF 为 null */
  videoUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

/** 引用帖内嵌原文卡（quoted_status 摘取的最小展示集） */
export interface QuotedPost {
  handle: string;
  name: string | null;
  profileImage: string | null;
  text: string | null;
  url: string | null;
  media?: PostMedia | null;
}

/** 一条帖子的互动数据（User Tweets 端点响应，与 posts 表字段对应） */
export interface PostData {
  tweetId: string;
  createdAt: string;
  fullText: string | null;
  views: number | null;
  likes: number | null;
  replies: number | null;
  retweets: number | null;
  quotes: number | null;
  bookmarks: number | null;
  lang: string | null;
  /** 附件媒体（照片 1-4 张 / 视频 / GIF）；无媒体为 null */
  media: PostMedia[] | null;
  /** X 原生帖子类型：tweet | reply | quote | retweet */
  tweetType: string | null;
  /** 引用帖内嵌原文卡；非引用帖为 null */
  quoted: QuotedPost | null;
}

/**
 * 数据源抽象：未来接入官方 X API / 成员 OAuth 时实现同一接口即可，
 * 采集与展示逻辑不变。
 */
export interface FollowerSource {
  readonly name: string;
  fetchStats(handle: string): Promise<FollowerStats>;
  /** 拉取用户最近帖子（第一页，约 20 条）。userId 为数字 ID，来自 profile 响应。 */
  fetchRecentPosts(userId: string): Promise<PostData[]>;
}
