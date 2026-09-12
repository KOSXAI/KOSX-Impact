/** 前后端共享的展示格式化工具（千分位 / 日期 / 大关档位缩写） */

export function fmt(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** 帖子正文摘要：剥掉全文/截断尾部的裸链接（X 的 t.co 包裹）后为空时返回 null，由调用方渲染占位文案 */
export function postExcerpt(text: string | null | undefined, max = 34): string | null {
  if (!text) return null;
  const stripped = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[·|—-]+$/, "");
  if (!stripped) return null;
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

/**
 * 帖子全文解析：正文保留原有分段（压平行内空白、合并 3+ 连续换行），
 * 抽出其中的 t.co 链接单独返回——X 把媒体/外链都包成 t.co，正文里留着是噪声。
 */
export function parsePostContent(raw: string | null | undefined): { text: string | null; links: string[] } {
  if (!raw) return { text: null, links: [] };
  const links: string[] = [];
  for (const m of raw.matchAll(/https?:\/\/\S+/g)) if (!links.includes(m[0])) links.push(m[0]);
  const text = raw
    .replace(/https?:\/\/\S+/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\u3000]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
  return { text: text || null, links };
}

export function badge(threshold: number): string {
  const short = (v: number): string =>
    Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
  if (threshold >= 100_000_000) return `${short(threshold / 100_000_000)}亿`;
  if (threshold >= 10000) return `${short(threshold / 10000)}万`;
  if (threshold >= 1000) return `${short(threshold / 1000)}千`;
  return String(threshold);
}
