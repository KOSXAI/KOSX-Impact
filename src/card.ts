import type { MemberStats } from "./stats";

/**
 * 成员进度卡片：内联 SVG，可嵌入 GitHub README / 个人主页 / 博客。
 * 用法：![Road to 10K](https://10k.kosx.ai/card/{id}.svg) 或 <img src="...">
 */

function esc(s: string): string {
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

function fmt(n: number): string {
  return n.toLocaleString("zh-CN");
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

const W = 600;
const H = 200;

/** 单成员进度卡片（SVG）。streak 为连续更新天数。 */
export function renderMemberCard(member: MemberStats): string {
  const name = member.displayName ?? member.handle;
  const current = member.latestFollowers ?? 0;
  const achieved = member.achieved;
  const progress = member.progress;
  const barWidth = Math.max(2, Math.min(100, progress)) * 3.2; // 内宽 ~320px

  const gradientId = `g${member.id.replace(/[^a-z0-9]/gi, "")}`;

  const statsRow = achieved
    ? `<text x="32" y="128" class="muted">超目标 <tspan class="green">+${fmt(member.overflow)}</tspan> · 连胜 ${member.streakDays} 天 · 下一站 ${fmt(member.goal + 5000)}</text>`
    : `<text x="32" y="128" class="muted">距目标还差 ${fmt(Math.max(0, member.goal - current))} · 连胜 ${member.streakDays} 天 · 7 天 +${fmt(member.growth7d)}</text>`;

  const footer = achieved
    ? `<text x="32" y="172" class="trophy">🏆 已达成 ${esc(fmt(member.goal))} · KOSX 万粉俱乐部</text>`
    : `<text x="32" y="172" class="trophy">Road to ${esc(fmt(member.goal))} · KOSX Impact</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)} 的 Road to 10K 进度卡片">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <linearGradient id="${gradientId}bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#faf5ff"/>
      <stop offset="100%" stop-color="#fefce8"/>
    </linearGradient>
  </defs>
  <style>
    .bg { fill: url(#${gradientId}bg); stroke: ${achieved ? "#eab308" : "#e2d9f3"}; stroke-width: 1.5; }
    .name { font: 700 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; fill: #1a1a1a; }
    .handle { font: 400 13px -apple-system, sans-serif; fill: #8a8a8a; }
    .num { font: 800 30px -apple-system, sans-serif; fill: #1a1a1a; }
    .numsub { font: 600 12px -apple-system, sans-serif; fill: #8a8a8a; }
    .muted { font: 400 13px -apple-system, "PingFang SC", sans-serif; fill: #666; }
    .green { fill: #16a34a; font-weight: 700; }
    .trophy { font: 600 13px -apple-system, "PingFang SC", sans-serif; fill: #7c3aed; }
    .track { fill: #e5e0ef; }
    .badge { font: 700 11px -apple-system, sans-serif; fill: #ffffff; }
    .badgebg { fill: ${achieved ? "#d97706" : "#2563eb"}; }
  </style>
  <rect class="bg" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14"/>
  <text x="32" y="46" class="name">${esc(name)}</text>
  <text x="32" y="68" class="handle">@${esc(member.handle)}</text>
  <g transform="translate(${W - 150}, 24)">
    <rect class="badgebg" x="0" y="0" width="118" height="22" rx="11"/>
    <text x="59" y="15" text-anchor="middle" class="badge">${achieved ? "已达成 10K 🏆" : `${progress}% / 100%`}</text>
  </g>
  <text x="${W - 32}" y="86" text-anchor="end" class="num">${fmt(current)}</text>
  <text x="${W - 32}" y="104" text-anchor="end" class="numsub">FOLLOWERS</text>
  <rect class="track" x="32" y="88" width="320" height="8" rx="4"/>
  <rect x="32" y="88" width="${achieved ? 320 : barWidth}" height="8" rx="4" fill="url(#${gradientId})"/>
  <text x="32" y="112" class="muted">${achieved ? "目标已达成，继续前进" : `${esc(fmt(member.baselineFollowers ?? 0))} → ${esc(fmt(member.goal))}`}</text>
  ${statsRow}
  ${footer}
  <text x="${W - 32}" y="172" text-anchor="end" class="handle">10k.kosx.ai · ${fmtDate(member.joinedAt)} 加入</text>
</svg>`;
}

/** 成员不存在时的占位卡片 */
export function renderNotFoundCard(id: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H / 2}" viewBox="0 0 ${W} ${H / 2}" role="img" aria-label="member not found">
  <rect x="1" y="1" width="${W - 2}" height="${H / 2 - 2}" rx="14" fill="#f6f4fb" stroke="#e2d9f3" stroke-width="1.5"/>
  <text x="${W / 2}" y="${H / 4}" text-anchor="middle" font="400 15px sans-serif" fill="#8a8a8a">未找到成员 ${esc(id)} · 10k.kosx.ai</text>
</svg>`;
}
/** 站点 OG 卡：社群总量 + 成员数（分享首页/关于页到社媒时的预览图） */
export function renderSiteOgCard(totalFollowers: number, memberCount: number): string {
  const gid = "oggrad";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300" role="img" aria-label="KOSX Impact">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="60%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>
  </defs>
  <style>
    .title { font: 800 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; fill: #ffffff; }
    .tag { font: 400 15px -apple-system, "PingFang SC", sans-serif; fill: #c7d2fe; }
    .num { font: 800 44px -apple-system, sans-serif; fill: #fbbf24; }
    .lbl { font: 500 13px -apple-system, "PingFang SC", sans-serif; fill: #a5b4fc; }
    .url { font: 600 14px -apple-system, sans-serif; fill: #e0e7ff; }
  </style>
  <rect x="0" y="0" width="600" height="300" rx="0" fill="url(#${gid})"/>
  <text x="40" y="72" class="title">KOSX Impact</text>
  <text x="40" y="102" class="tag">Road to 10K · 万粉计划进行中</text>
  <text x="40" y="180" class="num">${fmt(totalFollowers)}</text>
  <text x="40" y="204" class="lbl">社群总粉丝 · ${memberCount} 位成员被追踪</text>
  <text x="40" y="262" class="url">10k.kosx.ai</text>
</svg>`;
}
