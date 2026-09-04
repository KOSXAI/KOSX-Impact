export interface MilestoneEvent {
  threshold: number;
  achievedAt: string;
}

/** 万粉影响力计划的标准里程碑档位 */
const STANDARD_THRESHOLDS = [1000, 2500, 5000, 7500, 10000];

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
