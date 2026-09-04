import type { DashboardStats, MemberDetail } from "./stats";

/**
 * 看板页面：由 Worker 预渲染 HTML 骨架，数据通过 JSON API 获取后由原生 JS 渲染。
 * 无前端构建步骤，保持轻量；样式内联，随 Worker 一起经 CDN 分发。
 */

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem 3rem; line-height: 1.6; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { color: #e8e8e8; } }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  header { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
  h1 { font-size: 1.75rem; margin: 0; }
  .tagline { color: #888; margin: 0.25rem 0 0; }
  .back { font-size: 0.9rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin: 1.5rem 0; }
  .card { background: rgba(127, 127, 127, 0.1); border-radius: 10px; padding: 0.9rem 1rem; }
  .card .num { font-size: 1.5rem; font-weight: 700; }
  .card .label { font-size: 0.8rem; color: #888; }
  h2 { font-size: 1.15rem; margin: 1.75rem 0 0.75rem; }
  .member { display: flex; align-items: center; gap: 0.9rem; padding: 0.7rem 0; border-bottom: 1px solid rgba(127, 127, 127, 0.15); }
  .member .rank { width: 2rem; color: #888; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .member .info { flex: 1; min-width: 0; }
  .member .name { font-weight: 600; }
  .member .handle { color: #888; font-size: 0.85rem; }
  .member .meta { font-size: 0.8rem; color: #888; margin-top: 0.15rem; }
  .member .followers { text-align: right; flex-shrink: 0; }
  .member .followers .num { font-weight: 700; font-variant-numeric: tabular-nums; }
  .member .followers .delta { font-size: 0.8rem; color: #16a34a; }
  .bar { height: 6px; background: rgba(127, 127, 127, 0.15); border-radius: 3px; margin-top: 0.4rem; overflow: hidden; }
  .bar > div { height: 100%; background: linear-gradient(90deg, #2563eb, #7c3aed); border-radius: 3px; }
  .milestone { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid rgba(127, 127, 127, 0.12); font-size: 0.95rem; }
  .milestone .badge { background: rgba(124, 58, 237, 0.15); color: #7c3aed; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; font-weight: 600; flex-shrink: 0; }
  .milestone .date { margin-left: auto; color: #888; font-size: 0.85rem; flex-shrink: 0; }
  .empty { color: #888; padding: 1rem 0; }
  .club-note { color: #888; font-size: 0.85rem; margin: -0.5rem 0 0.75rem; }
  .celebrate { background: linear-gradient(90deg, rgba(234, 179, 8, 0.15), rgba(124, 58, 237, 0.12)); border: 1px solid rgba(234, 179, 8, 0.4); border-radius: 10px; padding: 0.6rem 1rem; margin-bottom: 1rem; font-size: 0.95rem; }
  .member.achieved { background: linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(234, 179, 8, 0.1)); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 12px; padding: 0.8rem 1rem; margin-bottom: 0.6rem; }
  .member.achieved .trophy { font-size: 1.6rem; flex-shrink: 0; }
  .done-badge { background: linear-gradient(90deg, #d97706, #7c3aed); color: #fff; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; font-weight: 700; vertical-align: 2px; }
  footer { margin-top: 2.5rem; font-size: 0.85rem; color: #888; }
  .chart { width: 100%; height: 260px; }
  .chart text { fill: #888; font-size: 11px; }
  .chart .axis { stroke: rgba(127, 127, 127, 0.25); }
  .chart .line { fill: none; stroke: #2563eb; stroke-width: 2; }
  .chart .area { fill: rgba(37, 99, 235, 0.12); }
  .chart .dot { fill: #2563eb; }
  .chart .goal { stroke: rgba(127, 127, 127, 0.4); stroke-dasharray: 4 4; }
  .chart .goal-label { fill: #888; font-size: 10px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin: 1.25rem 0; }
  .stat { background: rgba(127, 127, 127, 0.1); border-radius: 10px; padding: 0.8rem 1rem; }
  .stat .num { font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat .label { font-size: 0.8rem; color: #888; }
  .ms-list { list-style: none; padding: 0; margin: 0; }
  .ms-list li { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid rgba(127, 127, 127, 0.12); font-size: 0.95rem; }
  .ms-list .badge { background: rgba(124, 58, 237, 0.15); color: #7c3aed; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; font-weight: 600; }
  .ms-list .date { margin-left: auto; color: #888; font-size: 0.85rem; }
  .error { color: #dc2626; }
`;

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

function pageShell(title: string, body: string, ogImage?: string): string {
  const ogTags = ogImage
    ? `<meta property="og:image" content="${ogImage}"/>
    <meta name="twitter:card" content="summary_large_image"/>
    <meta name="twitter:image" content="${ogImage}"/>`
    : `<meta property="og:image" content="https://10k.kosx.ai/og.svg"/>
    <meta name="twitter:card" content="summary_large_image"/>
    <meta name="twitter:image" content="https://10k.kosx.ai/og.svg"/>`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="KOSX 社群的公开影响力数据平台：追踪成员在 X 上的成长，Road to 10K 万粉计划进行中。" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="看见每个人的成长，也看见整个社群正在产生多大的影响。" />
    <meta property="og:type" content="website" />
    ${ogTags}
    <style>${STYLES}</style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

export function renderDashboard(): string {
  return pageShell(
    "KOSX Impact · KOSX 社群影响力看板",
    `
    <header>
      <h1>KOSX Impact</h1>
      <p class="tagline">看见每个人的成长，也看见整个社群正在产生多大的影响。</p>
    </header>
    <main>
      <section class="cards" id="cards">
        <div class="card"><div class="num">—</div><div class="label">社群总粉丝</div></div>
        <div class="card"><div class="num">—</div><div class="label">累计增长</div></div>
        <div class="card"><div class="num">—</div><div class="label">里程碑</div></div>
        <div class="card"><div class="num">—</div><div class="label">追踪成员</div></div>
      </section>
      <div id="celebrate"></div>
      <div id="club"></div>
      <h2 id="board-title">增长榜</h2>
      <div id="board"><p class="empty">加载中…</p></div>
      <h2>最近里程碑</h2>
      <div id="milestones"><p class="empty">加载中…</p></div>
    </main>
    <footer>
      <p>数据每日更新一次，来自成员账号的公开信息。<a href="/about">关于与数据口径</a> · <a href="https://github.com/KOSXAI/KOSX-Impact">GitHub 仓库</a></p>
    </footer>
    <script>
      const fmt = (n) => n.toLocaleString("zh-CN");
      const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
      const badge = (t) => t >= 10000 ? "10K" : t >= 1000 ? (t / 1000) + "K" : t;
      fetch("/api/dashboard")
        .then((r) => r.json())
        .then((d) => {
          document.getElementById("cards").innerHTML = [
            ["社群总粉丝", d.totalFollowers],
            ["累计增长", d.totalGrowth],
            ["里程碑", d.totalMilestones],
            ["追踪成员", d.members.length],
          ].map(([label, num]) => '<div class="card"><div class="num">' + fmt(num) + '</div><div class="label">' + label + "</div></div>").join("");
          const board = document.getElementById("board");
          const club = document.getElementById("club");
          const boardTitle = document.getElementById("board-title");
          const achieved = d.members.filter((m) => m.achieved);
          const chasing = d.members.filter((m) => !m.achieved);
          if (d.members.length === 0) {
            club.innerHTML = "";
            board.innerHTML = '<p class="empty">还没有成员加入。第一批成员正在路上，敬请期待。</p>';
          } else {
            if (achieved.length > 0) {
              club.innerHTML = '<h2>🏆 万粉俱乐部</h2><p class="club-note">他们已达成 10K 目标，正在前往下一站。</p>' +
                achieved.map((m) => {
                  const nextGoal = m.goal >= 10000 ? Math.ceil((m.goal + 1) / 5000) * 5000 : 10000;
                  return '<div class="member achieved"><div class="trophy">🏆</div>' +
                    '<div class="info"><div class="name"><a href="/members/' + encodeURIComponent(m.id) + '">' + esc(m.displayName || m.handle) + '</a> <span class="done-badge">已达成 ' + badge(m.goal) + '</span></div>' +
                    '<div class="handle">@' + esc(m.handle) + "</div>" +
                    '<div class="meta">下一站 ' + fmt(nextGoal) + " · 连胜 " + m.streakDays + " 天 · 30 天 +" + fmt(m.growth30d) + "</div></div>" +
                    '<div class="followers"><div class="num">' + fmt(m.latestFollowers ?? 0) + '</div><div class="delta">超目标 +' + fmt(m.overflow) + "</div></div>" +
                    "</div>";
                }).join("");
              boardTitle.textContent = "冲刺中";
            }
            board.innerHTML = chasing.length === 0
              ? '<p class="empty">所有人都在庆祝中——暂时没有正在冲刺的成员。</p>'
              : chasing.map((m, i) => {
              const delta = m.growth > 0 ? "+" + fmt(m.growth) : fmt(m.growth);
              const meta = ["连续 " + m.streakDays + " 天", "7 天 +" + fmt(m.growth7d), "30 天 +" + fmt(m.growth30d)].join(" · ");
              return '<div class="member">' +
                '<div class="rank">' + (i + 1) + "</div>" +
                '<div class="info"><div class="name"><a href="/members/' + encodeURIComponent(m.id) + '">' + esc(m.displayName || m.handle) + "</a></div>" +
                '<div class="handle">@' + esc(m.handle) + "</div>" +
                '<div class="meta">' + meta + "</div>" +
                '<div class="bar"><div style="width:' + m.progress + '%"></div></div></div>' +
                '<div class="followers"><div class="num">' + fmt(m.latestFollowers ?? 0) + '</div><div class="delta">' + delta + "</div></div>" +
                "</div>";
            }).join("");
          }
          const ms = document.getElementById("milestones");
          if (d.recentMilestones.length === 0) {
            ms.innerHTML = '<p class="empty">还没有里程碑。第一个 1K 正在路上。</p>';
          } else {
            const latest = d.recentMilestones[0];
            const celebrate = document.getElementById("celebrate");
            if (celebrate && latest.achievedAt.slice(0, 10) >= new Date().toISOString().slice(0, 10)) {
              celebrate.innerHTML = '<div class="celebrate">🎉 刚刚达成：<a href="/members/' + encodeURIComponent(latest.memberId) + '">' + esc(latest.displayName || latest.handle) + "</a> 跨过 " + badge(latest.threshold) + "！</div>";
            }
            ms.innerHTML = d.recentMilestones.map((m) =>
              '<div class="milestone"><span class="badge">' + badge(m.threshold) + '</span><span><a href="/members/' + encodeURIComponent(m.memberId) + '">' + esc(m.displayName || m.handle) + "</a></span>" +
              '<span class="date">' + m.achievedAt.slice(0, 10) + "</span></div>"
            ).join("");
          }
        })
        .catch((err) => {
          document.getElementById("board").innerHTML = '<p class="error">加载失败：' + esc(err) + "</p>";
        });
    </script>
    `
  );
}

/** 成员详情页：成长曲线（内联 SVG）+ 里程碑。error 非空时渲染错误页。 */
export function renderMemberPage(
  id: string,
  error: string | null,
  detail?: MemberDetail
): string {
  if (error) {
    return pageShell("成员不存在 · KOSX Impact", `<p class="error">${esc(error)}</p><p><a href="/">← 返回看板</a></p>`);
  }
  const { member, snapshots, milestones } = detail!;

  const chart = renderChart(snapshots, member.goal);
  const msList = milestones.length
    ? milestones.map((m) =>
        `<li><span class="badge">${badge(m.threshold)}</span><span>${fmtDate(m.achievedAt)}</span></li>`
      ).join("")
    : '<p class="empty">还没有里程碑，第一个 1K 正在路上。</p>';

  return pageShell(
    `${member.displayName ?? member.handle} · KOSX Impact`,
    `
    <header>
      <h1>${esc(member.displayName ?? member.handle)}</h1>
      <span class="handle">@${esc(member.handle)}</span>
      <a class="back" href="/">← 返回看板</a>
    </header>
    <main>
      <section class="stat-grid">
        <div class="stat"><div class="num">${fmt(member.latestFollowers ?? 0)}</div><div class="label">当前粉丝</div></div>
        <div class="stat"><div class="num">${member.growth > 0 ? "+" : ""}${fmt(member.growth)}</div><div class="label">累计增长</div></div>
        <div class="stat"><div class="num">${member.progress}%</div><div class="label">目标进度（${fmt(member.goal)}）</div></div>
        <div class="stat"><div class="num">${member.streakDays}</div><div class="label">连续更新天数</div></div>
      </section>
      <h2>成长曲线</h2>
      ${chart}
      <h2>里程碑</h2>
      <ul class="ms-list">${msList}</ul>
    </main>
    <footer>
      <p>加入于 ${fmtDate(member.joinedAt)}${member.baselineFollowers !== null ? `，基线 ${fmt(member.baselineFollowers)} 粉丝` : ""}。数据每日更新一次。</p>
    </footer>
    `,
    `https://10k.kosx.ai/card/${encodeURIComponent(member.id)}.svg`
  );
}

function badge(threshold: number): string {
  return threshold >= 10000 ? "10K" : threshold >= 1000 ? `${threshold / 1000}K` : String(threshold);
}

/** 用内联 SVG 画粉丝量折线图：无依赖、可被 CDN 缓存、可嵌入 */
function renderChart(
  snapshots: Array<{ followers: number; recordedAt: string }>,
  goal: number
): string {
  if (snapshots.length === 0) {
    return '<p class="empty">还没有数据，加入追踪后每天更新。</p>';
  }
  const W = 800;
  const H = 240;
  const PAD = { top: 16, right: 16, bottom: 28, left: 64 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const values = snapshots.map((s) => s.followers);
  // Y 轴以数据范围为主，目标线离数据太远（>2 倍数据跨度）时不强行纳入，
  // 否则曲线会被压成一条线——此时目标线画在图内上沿之外，仅标注文字
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const dataSpan = Math.max(dataMax - dataMin, 1);
  const includeGoal = goal > dataMax && goal - dataMax < dataSpan * 2;
  const min = dataMin - dataSpan * 0.1;
  const max = includeGoal ? goal : dataMax + dataSpan * 0.15;
  const span = Math.max(max - min, 1);
  const x = (i: number) => PAD.left + (snapshots.length === 1 ? iw / 2 : (i / (snapshots.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - min) / span) * ih;

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = points.join(" ");
  const area = `${PAD.left},${PAD.top + ih} ${line} ${PAD.right + iw},${PAD.top + ih}`;
  // 目标线固定在图内上沿 8% 处（超出可视范围时仍在图内可见），并注明实际目标值
  const goalLineY = includeGoal ? y(goal) : PAD.top + ih * 0.08;
  const goalLabel = includeGoal ? `目标 ${fmt(goal)}` : `目标 ${fmt(goal)}（远在图外）`;

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + (span / ticks) * i;
    const yy = y(v).toFixed(1);
    return `<line class="axis" x1="${PAD.left}" y1="${yy}" x2="${PAD.right + iw}" y2="${yy}"/><text x="${PAD.left - 8}" y="${+yy + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`;
  }).join("");

  const labels = snapshots.map((s, i) => {
    if (snapshots.length > 14 && i % Math.ceil(snapshots.length / 7) !== 0) return "";
    return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtDate(s.recordedAt).slice(5)}</text>`;
  }).join("");

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="粉丝量成长曲线">
    ${grid}
    <line class="goal" x1="${PAD.left}" y1="${goalLineY.toFixed(1)}" x2="${PAD.right + iw}" y2="${goalLineY.toFixed(1)}"/>
    <text class="goal-label" x="${PAD.right + iw}" y="${goalLineY - 5}" text-anchor="end">${goalLabel}</text>
    <polygon class="area" points="${area}"/>
    <polyline class="line" points="${line}"/>
    ${values.map((v, i) => `<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="2.5"/>`).join("")}
    ${labels}
  </svg>`;
}

/** 关于页：数据口径 / 来源 / 加入与退出方式（README 承诺的透明度页面） */
export function renderAboutPage(): string {
  return pageShell(
    "关于 · KOSX Impact",
    `
    <header>
      <h1>关于 KOSX Impact</h1>
      <p class="tagline">看见每个人的成长，也看见整个社群正在产生多大的影响。</p>
      <a class="back" href="/">← 返回看板</a>
    </header>
    <main>
      <h2>这是什么</h2>
      <p>KOSX Impact 是 KOSX 社群的公开影响力数据平台，追踪成员在 X 上的公开成长数据（Road to 10K 万粉计划）。它是一块公开数据看板，也是一场社群共同成长的游戏——和自己比，不是竞赛。</p>

      <h2>数据来源与口径</h2>
      <ul>
        <li>数据全部来自成员 X 账号的<b>公开信息</b>（粉丝量、关注数、推文数），不含任何私密数据</li>
        <li>每日更新一次（北京时间上午 8 点左右），当日重复采集以最新值为准</li>
        <li>数据通过 SocialData（第三方公开数据接口）获取，仅读取公开主页可见的数字</li>
        <li>「累计增长」相对成员加入时的基线；「进度」= 累计增长 ÷ 个人目标</li>
        <li>里程碑在观察到增长跨过档位时记录（1K / 2.5K / 5K / 7.5K / 10K），加入前已达成的档位不追溯</li>
      </ul>

      <h2>榜单怎么排</h2>
      <p>冲刺榜按「和自己比」的进步排序：目标进度优先，其次近期 30 天增长。核心指标是相对基线的增长、相对目标的进度、连续更新天数——没有绝对粉丝量的排名，每一步进步都被看见。达成个人目标的成员自动进入「万粉俱乐部」荣誉区。</p>

      <h2>如何加入</h2>
      <p>在 <a href="https://github.com/KOSXAI/KOSX-Impact/issues/new?template=member-application.yml">GitHub 提交成员申请</a>（需勾选公开追踪同意声明），维护者协助把你的账号加入名册，从当天起你的成长曲线开始更新。</p>

      <h2>随时退出</h2>
      <p>你的数据你做主。任何成员可以随时退出：从名册移除后立即停止公开追踪；如需删除历史数据，联系维护者处理 <code>snapshots</code> / <code>milestones</code> 记录即可。</p>

      <h2>成员卡片</h2>
      <p>每位成员都有可嵌入个人主页 / GitHub README 的进度卡片：</p>
      <pre>&lt;img src="https://10k.kosx.ai/card/成员id.svg" width="480"&gt;</pre>
    </main>
    <footer>
      <p>开源仓库 <a href="https://github.com/KOSXAI/KOSX-Impact">KOSXAI/KOSX-Impact</a> · MIT License</p>
    </footer>
    `
  );
}
