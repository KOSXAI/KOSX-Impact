import type { MemberStats } from "./stats";
import { fmt, fmtDate } from "./lib/format";
import { TIER_STYLE, titleOf } from "./milestones";
import { SITE_URL } from "./lib/site";

/**
 * 成员进度卡片：内联 SVG，可嵌入 GitHub README / 个人主页 / 博客。
 * 用法：![KOSX 万粉影响力计划](https://impact.kosx.ai/card/{id}.svg) 或 <img src="...">
 * 配色对齐官网：纸底 #0a0a0a、墨色 #f7f7f5、信号橙 #ff6a00。
 */

/** SVG 文本转义（og.ts 模板共用） */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function fmtN(n: number): string {
  return n.toLocaleString("zh-CN");
}

const W = 600;
const H = 200;

/** 单成员进度卡片（SVG）：段位徽章 + 距下一称号的进度，永远有下一站 */
export function renderMemberCard(member: MemberStats): string {
  const name = member.displayName ?? member.handle;
  const current = member.latestFollowers ?? 0;
  const progress = member.progressToNext;
  const barWidth = Math.max(2, Math.min(100, progress)) * 3.2; // 内宽 ~320px
  const toNext = Math.max(0, member.nextMilestone - current);
  const prevTitle = member.prevMilestone > 0 ? titleOf(member.prevMilestone) : "新人村";
  const nextTitle = titleOf(member.nextMilestone);
  const tierFill = (TIER_STYLE[member.tierKey] ?? TIER_STYLE.seed).fill;

  const gradientId = `g${member.id.replace(/[^a-z0-9]/gi, "")}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)} 的万粉影响力进度卡片">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff3d00"/>
      <stop offset="100%" stop-color="#ffb347"/>
    </linearGradient>
  </defs>
  <style>
    .bg { fill: #0a0a0a; stroke: #2a2a2e; stroke-width: 1.5; }
    .name { font: 700 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; fill: #f7f7f5; }
    .handle { font: 400 13px -apple-system, sans-serif; fill: #9a9a9f; }
    .num { font: 800 30px -apple-system, sans-serif; fill: #f7f7f5; }
    .numsub { font: 600 12px -apple-system, sans-serif; fill: #8a8a8f; }
    .muted { font: 400 13px -apple-system, "PingFang SC", sans-serif; fill: #9a9a9f; }
    .signal { fill: #ff6a00; font-weight: 700; }
    .trophy { font: 600 13px -apple-system, "PingFang SC", sans-serif; fill: #ff6a00; }
    .track { fill: #2a2a2e; }
    .badge { font: 700 11px -apple-system, sans-serif; fill: #0a0a0a; }
    .badgebg { fill: ${tierFill}; }
  </style>
  <rect class="bg" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14"/>
  <text x="32" y="46" class="name">${esc(name)}</text>
  <text x="32" y="68" class="handle">@${esc(member.handle)}</text>
  <g transform="translate(${W - 150}, 24)">
    <rect class="badgebg" x="0" y="0" width="118" height="22" rx="11"/>
    <text x="59" y="15" text-anchor="middle" class="badge">${esc(member.tierName)}</text>
  </g>
  <text x="${W - 32}" y="86" text-anchor="end" class="num">${fmtN(current)}</text>
  <text x="${W - 32}" y="104" text-anchor="end" class="numsub">粉丝</text>
  <rect class="track" x="32" y="88" width="320" height="8" rx="4"/>
  <rect x="32" y="88" width="${barWidth}" height="8" rx="4" fill="url(#${gradientId})"/>
  <text x="32" y="112" class="muted">称号 ${esc(prevTitle)} → ${esc(nextTitle)}</text>
  <text x="32" y="128" class="muted">距「${esc(nextTitle)}」还差 <tspan class="signal">${fmtN(toNext)}</tspan></text>
  <text x="32" y="172" class="trophy">迈向「${esc(nextTitle)}」 · KOSX 万粉影响力计划</text>
  <text x="${W - 32}" y="172" text-anchor="end" class="handle">${SITE_URL.replace("https://", "")} · 加入于 ${fmtDate(member.joinedAt)}</text>
</svg>`;
}

/** 成员不存在时的占位卡片 */
export function renderNotFoundCard(id: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H / 2}" viewBox="0 0 ${W} ${H / 2}" role="img" aria-label="member not found">
  <rect x="1" y="1" width="${W - 2}" height="${H / 2 - 2}" rx="14" fill="#0a0a0a" stroke="#2a2a2e" stroke-width="1.5"/>
  <text x="${W / 2}" y="${H / 4}" text-anchor="middle" font="400 15px sans-serif" fill="#9a9a9f">未找到成员 ${esc(id)} · ${SITE_URL.replace("https://", "")}</text>
</svg>`;
}

/** 站点 OG 卡：社群总量 + 成员数（分享首页/关于页到社媒时的预览图） */
export function renderSiteOgCard(totalFollowers: number, memberCount: number): string {
  const gid = "oggrad";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300" role="img" aria-label="KOSX 万粉影响力计划">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111111"/>
      <stop offset="60%" stop-color="#0a0a0a"/>
    </linearGradient>
  </defs>
  <style>
    .title { font: 800 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; fill: #f7f7f5; }
    .tag { font: 400 15px -apple-system, "PingFang SC", sans-serif; fill: #9a9a9f; }
    .num { font: 800 44px -apple-system, sans-serif; fill: #ff6a00; }
    .lbl { font: 500 13px -apple-system, "PingFang SC", sans-serif; fill: #d0d0d0; }
    .url { font: 600 14px -apple-system, sans-serif; fill: #8a8a8f; }
  </style>
  <rect x="0" y="0" width="600" height="300" rx="0" fill="url(#${gid})"/>
  <rect x="1" y="1" width="598" height="298" rx="14" fill="none" stroke="#2a2a2e" stroke-width="1.5"/>
  <text x="40" y="72" class="title">KOSX 万粉影响力计划</text>
  <text x="40" y="102" class="tag">迈向万粉，看见成长</text>
  <text x="40" y="180" class="num">${fmtN(totalFollowers)}</text>
  <text x="40" y="204" class="lbl">社群总粉丝 · ${memberCount} 位成员被追踪</text>
  <text x="40" y="262" class="url">${SITE_URL.replace("https://", "")}</text>
</svg>`;
}
