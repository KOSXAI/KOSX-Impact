/** 前后端共享的展示格式化工具（千分位 / 日期 / 里程碑档位缩写） */

import { STANDARD_THRESHOLDS } from "../milestones";

export function fmt(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export function badge(threshold: number): string {
  if (threshold >= 10000) {
    const w = threshold / 10000;
    return `${Number.isInteger(w) ? w : w.toFixed(1)}万`;
  }
  if (threshold >= 1000) {
    const k = threshold / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}千`;
  }
  return String(threshold);
}

/** 达成后的下一站目标：下一个标准档位（万粉之后还有两万五、五万、十万、百万……） */
export function nextGoal(goal: number): number {
  // 标准表最高到 7.5 亿，超过后按 5000 步进兜底（现实中不会走到）
  return STANDARD_THRESHOLDS.find((t) => t > goal) ?? Math.ceil((goal + 1) / 5000) * 5000;
}