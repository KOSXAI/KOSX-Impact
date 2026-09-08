// 社群信号同步：共同关注 + 社群品味。
// - following：SocialData following 端点（$0.0002/人）采样头部 N 位成员各一页，
//   聚合出「成员们共同关注的外部大V」→ community_signal_counts(kind='following')
// - taste：纯库读——扫描 posts 全文里的外部 @提及（剔除成员自身），聚合「社群最近热议什么」
//   → community_signal_counts(kind='taste')，零额外 API
// 用法：先导出成员表（含 followers）+ 帖子全文：
//   wrangler d1 execute kosx-impact --remote --command "SELECT m.id, m.handle, m.user_id, (SELECT followers FROM snapshots s WHERE s.member_id=m.id ORDER BY s.recorded_at DESC LIMIT 1) AS f FROM members m WHERE m.status='active'" --json > /tmp/member-followers.json
//   wrangler d1 execute kosx-impact --remote --command "SELECT text FROM posts" --json > /tmp/posts-text.json
// 再：node scripts/sync-community-signals.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/community-signals.sql
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = readFileSync(resolve(root, ".dev.vars"), "utf-8").match(/SOCIALDATA_API_KEY=(\S+)/)?.[1];
if (!apiKey) throw new Error("SOCIALDATA_API_KEY not found in .dev.vars");

const TOP_SAMPLE = 8; // following 采样头部 N 位成员，控成本
const API_BASE = "https://api.socialdata.tools";
let lastAt = 0;
async function throttledFetch(path) {
  const wait = lastAt + 500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt = Date.now();
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}
const lit = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const now = new Date().toISOString();
const sql = [];

// ---- following：共同关注 ----
const rawDump = JSON.parse(readFileSync("/tmp/member-followers.json", "utf-8"));
let memberRows = [];
for (const layer of Array.isArray(rawDump) ? rawDump : [rawDump]) {
  if (Array.isArray(layer)) memberRows.push(...layer);
  else if (Array.isArray(layer.results)) memberRows.push(...layer.results);
}
const members = memberRows
  .map((r) => ({ id: r.id, handle: r.handle, user_id: r.user_id, followers: r.f ?? 0 }))
  .filter((m) => m.user_id)
  .sort((a, b) => b.followers - a.followers)
  .slice(0, TOP_SAMPLE);

const followingCount = new Map(); // handle -> {name, members:Set}
let followingOk = 0;
for (const m of members) {
  try {
    const page = await throttledFetch(`/twitter/user/${m.user_id}/following`);
    const users = Array.isArray(page.users) ? page.users : [];
    for (const u of users) {
      const h = (u.screen_name || "").toLowerCase();
      if (!h) continue;
      const rec = followingCount.get(h) ?? { name: u.name ?? null, members: new Set() };
      rec.members.add(m.id);
      followingCount.set(h, rec);
    }
    followingOk++;
    console.log(`@${m.handle} 关注页 ${users.length} 人`);
  } catch (e) {
    console.log(`@${m.handle} ✗ ${e.message}`);
  }
}
for (const [handle, rec] of followingCount) {
  if (rec.members.size < 2) continue; // 至少 2 位成员共同关注才有信号
  sql.push(
    `INSERT OR REPLACE INTO community_signal_counts (kind, handle, name, count, updated_at)
     VALUES ('following', ${lit(handle)}, ${lit(rec.name)}, ${rec.members.size}, ${lit(now)});`
  );
}
console.log(`following 完成：${followingOk}/${members.length} 位成员，共同关注信号 ${[...followingCount.values()].filter((r) => r.members.size >= 2).length} 条`);

// ---- taste：社群帖子中的外部提及（纯库读） ----
if (existsSync("/tmp/posts-text.json")) {
  const posts = JSON.parse(readFileSync("/tmp/posts-text.json", "utf-8"));
  const rows = Array.isArray(posts) ? posts[0]?.results ?? posts : posts[0]?.results ?? [];
  // 兼容 wrangler --json 包裹结构
  let arr = [];
  for (const layer of Array.isArray(posts) ? posts : [posts]) {
    if (Array.isArray(layer)) arr.push(...layer);
    else if (Array.isArray(layer.results)) arr.push(...layer.results);
  }
  const memberHandles = new Set(members.map((m) => m.handle.toLowerCase()));
  const tasteCount = new Map(); // handle -> count
  for (const r of arr) {
    if (!r.text) continue;
    const matches = r.text.toLowerCase().match(/@([a-z0-9_]{2,30})/g) ?? [];
    for (const raw of matches) {
      const h = raw.slice(1);
      if (memberHandles.has(h)) continue; // 成员之间互提不算「品位」，走互推图谱
      tasteCount.set(h, (tasteCount.get(h) ?? 0) + 1);
    }
  }
  const tasteTop = [...tasteCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [handle, count] of tasteTop) {
    sql.push(
      `INSERT OR REPLACE INTO community_signal_counts (kind, handle, name, count, updated_at)
       VALUES ('taste', ${lit(handle)}, NULL, ${count}, ${lit(now)});`
    );
  }
  console.log(`taste 完成：${tasteTop.length} 条外部热议账号`);
}

sql.push(`INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;`);

writeFileSync("/tmp/community-signals.sql", sql.join("\n\n") + "\n");
console.log(`写入 /tmp/community-signals.sql（${sql.length} 条）`);
console.log(`执行：wrangler d1 execute kosx-impact --remote --file=/tmp/community-signals.sql`);