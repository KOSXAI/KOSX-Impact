export interface MilestoneEvent {
  threshold: number;
  achievedAt: string;
}

/** 「万粉」达成线：看板「万粉成员」统计的判定阈值（段位 万粉达人 的起点） */
export const TEN_K = 10_000;

/**
 * 均匀成就阶梯：每个数量级内固定 18 级台阶，步长随量级放大 10 倍——
 * 百粉段每 100 一档、千粉段每 500 一档、万粉段每 5000 一档、十万粉段每 5 万……
 * 每个段位要登的台阶数完全相同（均匀感），跨度随量级自然增长（每级都可达成）。
 * 「万粉」只是其中一级：一万、十万、百万、千万都被覆盖，台阶不封顶。
 */
export const UNIFORM_THRESHOLDS: number[] = (() => {
  const out: number[] = [];
  for (let f = 100; f < 1000; f += 100) out.push(f); // 百粉段：每 100 一档
  for (let base = 1000; base <= 1_000_000_000; base *= 10) {
    for (let t = base; t < base * 10; t += base / 2) out.push(t); // 每段 18 档
  }
  return out;
})();

/* ============ 段位（量级身份徽章，与台阶解耦） ============ */

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

/* ============ 台阶（均匀成就阶梯的当前档与下一档） ============ */

/** 当前台阶的起点（粉丝量低于首档时从 0 起） */
export function prevThreshold(followers: number): number {
  let prev = 0;
  for (const t of UNIFORM_THRESHOLDS) {
    if (t > followers) return prev;
    prev = t;
  }
  return prev; // 超过最高档（现实中不会发生）：以最后一档为起点
}

/** 下一级台阶：第一个严格大于当前粉丝量的档位 */
export function nextThreshold(followers: number): number {
  for (const t of UNIFORM_THRESHOLDS) {
    if (t > followers) return t;
  }
  const last = UNIFORM_THRESHOLDS[UNIFORM_THRESHOLDS.length - 1];
  return last + last / 2; // 超出最高档：按最后一段的步长继续
}

/** 距下一级台阶的完成度（0-100，整数） */
export function progressToNext(followers: number): number {
  const prev = prevThreshold(followers);
  const next = nextThreshold(followers);
  if (next <= prev) return 100;
  return Math.min(100, Math.round(((followers - prev) / (next - prev)) * 100));
}

/**
 * 检测一次新快照跨过了哪些台阶。
 * 没有历史快照时不产生事件——台阶只在观察到的增长中触发。
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
