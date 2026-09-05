export interface MilestoneEvent {
  threshold: number;
  achievedAt: string;
}

/** 「万粉」达成线：看板「万粉成员」统计的判定阈值（段位 万粉达人 的起点） */
export const TEN_K = 10_000;

/* ============ 称号大关（里程碑） ============ */

export interface Milestone {
  threshold: number;
  title: string;
}

/**
 * 称号大关：跨过一道大关领一个称号，搞笑但必须是好彩头。
 * 百粉、五百粉起步，千粉、五千粉各一道，之后每 5000 一道直到十万，
 * 再往上按量级放大；「万粉」是本计划同名大关（万人迷），最隆重的一道仪式。
 * 所有档位都是旧均匀阶梯的子集——库里的登阶历史按 threshold 记录，
 * 换表后 ladderSet 过滤直接命中，无需任何数据迁移。
 */
export const MILESTONES: Milestone[] = [
  { threshold: 100, title: "百里挑一" },
  { threshold: 500, title: "五福临门" },
  { threshold: 1_000, title: "千帆竞发" },
  { threshold: 5_000, title: "学富五车" },
  { threshold: 10_000, title: "万人迷" },
  { threshold: 15_000, title: "势如破竹" },
  { threshold: 20_000, title: "万众瞩目" },
  { threshold: 25_000, title: "百尺竿头" },
  { threshold: 30_000, title: "三阳开泰" },
  { threshold: 40_000, title: "四海扬名" },
  { threshold: 50_000, title: "五谷丰登" },
  { threshold: 60_000, title: "六六大顺" },
  { threshold: 70_000, title: "七星高照" },
  { threshold: 80_000, title: "八面威风" },
  { threshold: 90_000, title: "九天揽月" },
  { threshold: 100_000, title: "十全十美" },
  { threshold: 1_000_000, title: "百万雄师" },
  { threshold: 10_000_000, title: "名满天下" },
  { threshold: 100_000_000, title: "亿鸣惊人" },
];

/** 大关门槛列表：登阶检测与历史档位过滤共用 */
export const MILESTONE_THRESHOLDS: number[] = MILESTONES.map((m) => m.threshold);

const TITLE_BY_THRESHOLD = new Map(MILESTONES.map((m) => [m.threshold, m.title]));

/** 称号名：只对大关档位有效（prev/next 恒来自表内），未知档位回退数字 */
export function titleOf(threshold: number): string {
  return TITLE_BY_THRESHOLD.get(threshold) ?? String(threshold);
}

/* ============ 段位（量级身份徽章，与称号大关解耦） ============ */

export interface Tier {
  key: string;
  name: string;
}

/** 段位定义（从高到低）：首页段位分布与成员页段位徽章共用 */
export const TIERS: Array<{ min: number; tier: Tier }> = [
  { min: 100_000_000, tier: { key: "hundredm", name: "亿级传说" } },
  { min: 10_000_000, tier: { key: "tenm", name: "千万粉神话" } },
  { min: 1_000_000, tier: { key: "million", name: "百万粉传奇" } },
  { min: 100_000, tier: { key: "hundredk", name: "十万粉影响力" } },
  { min: 10_000, tier: { key: "tenk", name: "万粉达人" } },
  { min: 1_000, tier: { key: "thousand", name: "千粉新秀" } },
  { min: 0, tier: { key: "seed", name: "新芽" } },
];

/** 段位徽章配色：React 用 badge class，SVG 卡用 fill hex（同一映射两处消费） */
export const TIER_STYLE: Record<string, { badge: string; fill: string }> = {
  seed: { badge: "border-slate-400/30 bg-slate-400/10 text-slate-300", fill: "#94a3b8" },
  thousand: { badge: "border-sky-400/30 bg-sky-400/10 text-sky-300", fill: "#38bdf8" },
  tenk: { badge: "border-signal/40 bg-signal/10 text-signal", fill: "#ff6a00" },
  hundredk: { badge: "border-violet-400/30 bg-violet-400/10 text-violet-300", fill: "#a78bfa" },
  million: { badge: "border-amber-300/40 bg-amber-300/10 text-amber-300", fill: "#fbbf24" },
  tenm: { badge: "border-rose-400/40 bg-rose-400/10 text-rose-300", fill: "#fb7185" },
  hundredm: { badge: "border-amber-200/50 bg-amber-200/10 text-amber-100", fill: "#fde68a" },
};

/** 按当前粉丝量取段位（量级身份，只升不降） */
export function tierOf(followers: number): Tier {
  return TIERS.find((t) => followers >= t.min)!.tier;
}

/* ============ 大关定位（当前所在赛段与下一道关） ============ */

/** 上一道大关的门槛（粉丝量低于首关时为 0，赛段从新人村起步） */
export function prevThreshold(followers: number): number {
  let prev = 0;
  for (const t of MILESTONE_THRESHOLDS) {
    if (t > followers) return prev;
    prev = t;
  }
  return prev; // 超过最高关（现实中不会发生）：以最后一关为起点
}

/** 下一道大关：第一个严格大于当前粉丝量的档位 */
export function nextThreshold(followers: number): number {
  for (const t of MILESTONE_THRESHOLDS) {
    if (t > followers) return t;
  }
  let next = MILESTONE_THRESHOLDS[MILESTONE_THRESHOLDS.length - 1] * 2; // 超出最高关：翻倍继续
  while (next <= followers) next *= 2;
  return next;
}

/** 距下一道大关的完成度（0-100，整数） */
export function progressToNext(followers: number): number {
  const prev = prevThreshold(followers);
  const next = nextThreshold(followers);
  if (next <= prev) return 100;
  return Math.min(100, Math.round(((followers - prev) / (next - prev)) * 100));
}

/**
 * 检测一次新快照跨过了哪些大关。
 * 没有历史快照时不产生事件——大关只在观察到的增长中触发。
 */
export function detectMilestones(
  prevFollowers: number | undefined,
  current: number,
  thresholds: number[],
  achievedAt: string
): MilestoneEvent[] {
  if (prevFollowers === undefined) return [];
  return thresholds
    .filter((t) => prevFollowers < t && t <= current)
    .map((threshold) => ({ threshold, achievedAt }));
}
