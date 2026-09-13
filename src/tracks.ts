/**
 * 赛道体系（单一事实来源）：5 个正式赛道 + 综合兜底。
 * - 一人可挂多个赛道（tracks 数组），按内容主线排序
 * - 「综合」是过渡桶：无法归入任何正式赛道的成员挂这里，
 *   人数攒够或分类维度清晰后再细分出新赛道，故综合不参与榜单
 * - 分类产物由人工/agent 判断产出，脚本入库（scripts/apply-tracks.mjs），
 *   不做网页自动分类
 */

export interface Track {
  slug: string;
  /** 展示名（短，chip/榜单用） */
  name: string;
  /** lucide 图标名（组件侧映射到 lucide 组件，勿直接渲染字符串） */
  icon: string;
  /** 一句话界定（悬停提示 / 关于页用） */
  description: string;
}

/** 正式赛道（顺序即榜单展示顺序）。2026-09-07 定稿：用户对标竞品赛道库后拍板 */
export const TRACKS: Track[] = [
  {
    slug: "ai-tools",
    name: "AI工具",
    icon: "Sparkles",
    description: "不写代码，靠 AI 工具落地 / 培训 / 服务 / 分享",
  },
  {
    slug: "finance",
    name: "财经",
    icon: "CandlestickChart",
    description: "美股 / 加密 / 交易 / 宏观",
  },
  {
    slug: "developer",
    name: "开发者",
    icon: "Blocks",
    description: "写代码 / 造产品 / SaaS / Indie Hacker",
  },
  {
    slug: "growth",
    name: "增长",
    icon: "PenTool",
    description: "自媒体 / 做号 / 营销 / 运营",
  },
  {
    slug: "global",
    name: "出海",
    icon: "Globe",
    description: "跨境 / 华语 X 出海",
  },
];

/** 综合兜底：过渡桶，不参与榜单 */
export const TRACK_OTHER: Track = {
  slug: "other",
  name: "综合",
  icon: "Shapes",
  description: "无法归入正式赛道时的过渡桶，攒够人数后细分",
};

/** 全部赛道名（含综合）：分类脚本枚举白名单，跑偏项拒绝 */

/** 按赛道名取 Track（未知名返回 undefined） */
export function trackOf(name: string): Track | undefined {
  return [...TRACKS, TRACK_OTHER].find((t) => t.name === name);
}
