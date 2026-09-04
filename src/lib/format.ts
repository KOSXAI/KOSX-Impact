/** 前后端共享的展示格式化工具（千分位 / 日期 / 里程碑档位缩写） */

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

/** 达成后的下一站目标：向上取整到 5000 倍数 */
export function nextGoal(goal: number): number {
  return goal >= 10000 ? Math.ceil((goal + 1) / 5000) * 5000 : 10000;
}