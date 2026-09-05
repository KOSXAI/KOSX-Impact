/**
 * OG 分享卡模板（1200×630 PNG）：成员页 / 首页 / 关于页分享到 X、微信等平台时的预览图。
 * 本文件是纯模板层（无 IO，可单测）；光栅化与路由在 og-render.ts。
 * 为什么必须是 PNG：X/微信等平台不渲染 SVG 格式的 og:image——/card/*.svg 与 /og.svg
 * 只服务于嵌入与 favicon，分享预览一律走这里输出的 PNG。
 * 配色沿用官网令牌：纸底 #0a0a0a、墨色 #f7f7f5、信号橙 #ff6a00；段位色取 TIER_STYLE.fill。
 */
import type { MemberStats } from "./stats";
import { esc } from "./card";
import { badge, fmt } from "./lib/format";
import { TIER_STYLE } from "./milestones";

export const OG_W = 1200;
export const OG_H = 630;
const PAD = 80;
/** 内容区宽度（左右各留 PAD） */
const CONTENT_W = OG_W - PAD * 2;
const LINE = "#2a2a2e";
const INK = "#f7f7f5";
const MIST = "#9a9a9f";
const SUBTLE = "#d0d0d0";
const SIGNAL = "#ff6a00";
const FONT = "Noto Sans SC";

/** 卡面 logo（ASSETS 里的白字标转 data URI）：href 内嵌图，aspect 为宽高比 */
export interface OgLogo {
  href: string;
  aspect: number;
}

/** 站点 OG 卡入参（DashboardStats 的卡面所需子集） */
export interface SiteOgStats {
  totalFollowers: number;
  memberCount: number;
  tenKMembers: number;
  growth30d: number;
}

const CJK_RE = /^[\u2E80-\u9FFF\u3000-\u303F\uF900-\uFAFF\uFF00-\uFFEF]$/;

/**
 * 估宽：CJK 与全角按 1em，数字/大写 0.62，小写 0.52，空格 0.3，其余标点 0.32。
 * SVG 文本没有自动换行/截断，超宽全靠模板层预算。
 */
function textW(s: string, size: number): number {
  let em = 0;
  for (const ch of s) {
    if (CJK_RE.test(ch)) em += 1;
    else if (/[A-Z0-9@#%&WM]/.test(ch)) em += 0.62;
    else if (/[a-z]/.test(ch)) em += 0.52;
    else if (ch === " ") em += 0.3;
    else em += 0.32;
  }
  return em * size;
}

/** 超宽截断：留出一个省略号的宽度 */
function truncate(s: string, maxW: number, size: number): string {
  if (textW(s, size) <= maxW) return s;
  const chars = [...s];
  while (chars.length > 1 && textW(chars.join(""), size) > maxW - size) chars.pop();
  return chars.join("") + "…";
}

/** 增长文本：正数带 +，负数自带 -，零显示 0（±0 不引入新字形） */
function growthText(g: number): string {
  return `${g > 0 ? "+" : ""}${fmt(g)}`;
}

const SITE_URL_TEXT = "impact.kosx.ai";

const linearGradient = `<linearGradient id="ogacc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff3d00"/><stop offset="1" stop-color="#ffb347"/></linearGradient>`;

/** 卡面骨架：底色 + 段位色辉光 + 内描边框 + logo 头部，共用给成员卡与站点卡 */
function frame(accent: string, logo: OgLogo | null): string {
  const logoEl = logo
    ? `<image x="${PAD}" y="52" width="${(38 * logo.aspect).toFixed(1)}" height="38" href="${logo.href}"/>`
    : `<text x="${PAD}" y="84" font-size="34" font-weight="800" fill="${INK}">KOSX</text>`;
  return `<rect width="${OG_W}" height="${OG_H}" fill="#0a0a0a"/>
<radialGradient id="ogglow"><stop offset="0" stop-color="${accent}" stop-opacity="0.20"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
<circle cx="1020" cy="-40" r="540" fill="url(#ogglow)"/>
<rect x="0.75" y="0.75" width="${OG_W - 1.5}" height="${OG_H - 1.5}" rx="24" fill="none" stroke="${LINE}" stroke-width="1.5"/>
${logoEl}`;
}

function footer(left: string): string {
  return `<rect x="${PAD}" y="578" width="${CONTENT_W}" height="1" fill="${LINE}"/>
<text x="${PAD}" y="608" font-size="24" fill="${MIST}">${esc(left)}</text>
<text x="${OG_W - PAD}" y="608" font-size="24" font-weight="600" fill="${SUBTLE}" text-anchor="end">${SITE_URL_TEXT}</text>`;
}

/**
 * 成员 OG 卡：左列是身份（段位 pill / 昵称 / @handle），右列是数据（粉丝大数 + 近 7/30 天增长），
 * 下方一条台阶进度带。无快照时大数位显示「—」并注明首次采集排队中。
 */
export function memberOgSvg(
  stats: MemberStats,
  opts: { climbs: number; logo: OgLogo | null }
): string {
  const tierFill = (TIER_STYLE[stats.tierKey] ?? TIER_STYLE.seed).fill;
  const hasSnapshot = stats.latestFollowers != null;
  const followers = stats.latestFollowers ?? 0;

  const followerStr = hasSnapshot ? fmt(followers) : "—";
  const numSize = followerStr.length >= 9 ? 96 : 120;
  const numW = textW(followerStr, numSize);

  const nameSize = 62;
  const name = truncate(stats.displayName ?? stats.handle, Math.max(320, CONTENT_W - numW - 48), nameSize);
  const handle = `@${stats.handle}`;

  const tierName = stats.tierName;
  const pillW = textW(tierName, 24) + 52;

  const nextGap = Math.max(0, stats.nextTier - followers);

  // 增长行颜色：近 7 天为正时用信号橙加粗，其余墨灰
  const g7 = stats.growth7d;
  const g7Color = g7 > 0 ? SIGNAL : MIST;
  const g7Weight = g7 > 0 ? ' font-weight="700"' : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" role="img" aria-label="${esc(name)} 的 KOSX 影响力卡片">
<defs>${linearGradient}</defs>
<g font-family="${FONT}">
${frame(tierFill, opts.logo)}
<rect x="${PAD}" y="136" width="${pillW.toFixed(1)}" height="44" rx="22" fill="${tierFill}" fill-opacity="0.12" stroke="${tierFill}" stroke-opacity="0.4"/>
<text x="${(PAD + pillW / 2).toFixed(1)}" y="166" font-size="24" font-weight="700" fill="${tierFill}" text-anchor="middle">${esc(tierName)}</text>
<text x="${PAD}" y="258" font-size="${nameSize}" font-weight="700" fill="${INK}">${esc(name)}</text>
<text x="${PAD}" y="306" font-size="30" fill="${MIST}">${esc(handle)}</text>
<text x="${OG_W - PAD}" y="258" font-size="${numSize}" font-weight="700" fill="${INK}" text-anchor="end">${esc(followerStr)}</text>
<text x="${OG_W - PAD}" y="306" font-size="28" fill="${MIST}" text-anchor="end">${hasSnapshot ? "粉丝" : "首次采集排队中"}</text>
<text x="${OG_W - PAD}" y="364" font-size="28"${g7Weight} fill="${g7Color}" text-anchor="end">近7天 ${esc(growthText(g7))}</text>
<text x="${OG_W - PAD}" y="408" font-size="26" fill="${MIST}" text-anchor="end">近30天 ${esc(growthText(stats.growth30d))}</text>
<text x="${PAD}" y="476" font-size="26" fill="${MIST}">台阶 ${esc(badge(stats.prevTier))} → ${esc(badge(stats.nextTier))}</text>
<text x="${OG_W - PAD}" y="476" font-size="26" fill="${MIST}" text-anchor="end">已登 ${fmt(opts.climbs)} 阶</text>
<rect x="${PAD}" y="496" width="${CONTENT_W}" height="12" rx="6" fill="${LINE}"/>
<rect x="${PAD}" y="496" width="${(progressFillW(stats.progressToNext)).toFixed(1)}" height="12" rx="6" fill="url(#ogacc)"/>
<text x="${PAD}" y="556" font-size="26" fill="${MIST}">距下一台阶还差 <tspan font-weight="700" fill="${SIGNAL}">${esc(fmt(nextGap))}</tspan></text>
${footer("迈向万粉，看见成长")}
</g>
</svg>`;
}

/** 进度条填充宽：0 时不画（只剩轨道），>0 时保底一段可见的圆头 */
function progressFillW(progress: number): number {
  if (progress <= 0) return 0;
  return Math.min(CONTENT_W, Math.max(14, (CONTENT_W * progress) / 100));
}

/** 站点 OG 卡：品牌主视觉 + 社群总量大数（信号橙），供首页 / 关于页分享预览 */
export function siteOgSvg(stats: SiteOgStats, logo: OgLogo | null): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" role="img" aria-label="KOSX 万粉影响力计划">
<defs>${linearGradient}</defs>
<g font-family="${FONT}">
${frame(SIGNAL, logo)}
<text x="${PAD}" y="292" font-size="72" font-weight="700" fill="${INK}">KOSX 万粉影响力计划</text>
<text x="${PAD}" y="352" font-size="34" fill="${MIST}">迈向万粉，看见成长</text>
<text x="${PAD}" y="496" font-size="130" font-weight="700" fill="${SIGNAL}">${esc(fmt(stats.totalFollowers))}</text>
<text x="${PAD}" y="546" font-size="28" fill="${MIST}">社群总粉丝 · ${fmt(stats.memberCount)} 位成员 · ${fmt(stats.tenKMembers)} 位已达万粉</text>
${footer(`近30天 ${growthText(stats.growth30d)}`)}
</g>
</svg>`;
}
