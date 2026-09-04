export interface MilestoneEvent {
  threshold: number;
  achievedAt: string;
}

/**
 * 标准里程碑档位：每个数量级（千/万/十万/百万/千万…）内生成 1 / 2.5 / 5 / 7.5 档。
 * 「万粉」是影响力量级的第一级台阶——一万、十万、百万、千万都被万粉计划覆盖，
 * 档位不封顶：达成一级，下一级自动出现。生成到十亿（7.5 亿）已覆盖任何真实目标。
 */
const MAX_ORDER = 9;

export const STANDARD_THRESHOLDS: number[] = (() => {
  const out: number[] = [];
  for (let base = 1000; base < 10 ** MAX_ORDER; base *= 10) {
    for (const mult of [1, 2.5, 5, 7.5]) out.push(base * mult);
  }
  // base 递增且每级最大 7.5×base < 10×base（下一级最小），天然严格升序
  return out;
})();

/** 给定个人目标，返回应追踪的里程碑档位（标准档位 + 个人目标本身，去重升序） */
export function thresholdsForGoal(goal: number): number[] {
  const all = [...STANDARD_THRESHOLDS, goal].filter((t) => t <= goal);
  return [...new Set(all)].sort((a, b) => a - b);
}

/**
 * 检测一次新快照跨过了哪些里程碑。
 * 没有历史快照时不产生事件——里程碑只在观察到的增长中触发。
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
