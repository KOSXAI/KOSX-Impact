/** 前后端共享的展示格式化工具（千分位 / 日期 / 大关档位缩写） */

export function fmt(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** 帖子正文摘要：正文只有一条链接（X 的 t.co 包裹）时返回 null，由调用方渲染占位文案 */
export function postExcerpt(text: string | null | undefined, max = 34): string | null {
  if (!text) return null;
  const t = text.trim();
  if (/^https?:\/\/\S+$/.test(t)) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function badge(threshold: number): string {
  const short = (v: number): string =>
    Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
  if (threshold >= 100_000_000) return `${short(threshold / 100_000_000)}亿`;
  if (threshold >= 10000) return `${short(threshold / 10000)}万`;
  if (threshold >= 1000) return `${short(threshold / 1000)}千`;
  return String(threshold);
}
