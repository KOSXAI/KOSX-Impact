/**
 * 看板页面骨架。
 *
 * 页面由 Worker 预渲染后经 CDN 分发；成员数据通过 JSON API 获取。
 * 完整的可视化前端（增长榜 / 里程碑 / 社群总量）在后续迭代中完善。
 */
export function renderDashboard(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KOSX Impact · KOSX 社群影响力看板</title>
    <meta name="description" content="KOSX 社群的公开影响力数据平台：追踪成员在 X 上的成长，Road to 10K 万粉计划进行中。" />
    <meta property="og:title" content="KOSX Impact · KOSX 社群影响力看板" />
    <meta property="og:description" content="看见每个人的成长，也看见整个社群正在产生多大的影响。" />
    <meta property="og:type" content="website" />
    <style>
      :root { color-scheme: light dark; }
      body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; line-height: 1.6; }
      h1 { font-size: 2rem; margin-bottom: 0.25rem; }
      .tagline { color: #888; margin-top: 0; }
      pre { background: rgba(127, 127, 127, 0.12); padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; }
      code { background: rgba(127, 127, 127, 0.12); padding: 0.15em 0.4em; border-radius: 4px; }
    </style>
  </head>
  <body>
    <header>
      <h1>KOSX Impact</h1>
      <p class="tagline">看见每个人的成长，也看见整个社群正在产生多大的影响。</p>
    </header>
    <main>
      <p>🚧 看板开发中。数据 API 已就绪，可视化前端（增长榜 / 里程碑 / 社群总量）将在后续迭代上线。</p>
      <h2>成员数据预览</h2>
      <p>来自 <code>GET /api/members</code>：</p>
      <pre id="members">加载中…</pre>
    </main>
    <script>
      fetch("/api/members")
        .then((r) => r.json())
        .then((data) => { document.getElementById("members").textContent = JSON.stringify(data, null, 2); })
        .catch((err) => { document.getElementById("members").textContent = "加载失败：" + err; });
    </script>
  </body>
</html>
`;
}
