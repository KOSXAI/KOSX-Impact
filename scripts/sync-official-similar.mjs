// 官方相似账号同步：SocialData get-user-similar-profiles（/twitter/user/{id}/similar，$0.0002/人）。
// 复用库内 user_id，覆盖全部活跃成员；结果并入 similar_accounts（reason='官方相似推荐'），
// 成员页「相似账号」卡片展示。幂等（INSERT OR REPLACE）+ cache_bust +1。
// 用法：先导出成员表：
//   wrangler d1 execute kosx-impact --remote --command "SELECT id, handle, user_id FROM members WHERE status='active'" --json > /tmp/member-handles.json
// 再：node scripts/sync-official-similar.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/official-similar.sql
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = readFileSync(resolve(root, ".dev.vars"), "utf-8").match(/SOCIALDATA_API_KEY=(\S+)/)?.[1];
if (!apiKey) throw new Error("SOCIALDATA_API_KEY not found in .dev.vars");
if (!existsSync("/tmp/member-handles.json")) throw new Error("先导出成员表到 /tmp/member-handles.json");
const raw = JSON.parse(readFileSync("/tmp/member-handles.json", "utf-8"));
let members = [];
for (const layer of Array.isArray(raw) ? raw : [raw]) {
  if (Array.isArray(layer)) members.push(...layer);
  else if (Array.isArray(layer.results)) members.push(...layer.results);
}
members = members.filter((m) => m.user_id);

const API_BASE = "https://api.socialdata.tools";
let lastAt = 0;
async function throttledFetch(path) {
  const wait = lastAt + 600 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt = Date.now();
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}
const lit = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const now = new Date().toISOString();
const sql = [];
let ok = 0;
let total = 0;
const failures = [];

for (const m of members) {
  process.stdout.write(`@${m.handle} … `);
  try {
    const page = await throttledFetch(`/twitter/user/${m.user_id}/similar`);
    const users = Array.isArray(page.users) ? page.users.slice(0, 5) : [];
    for (const u of users) {
      const h = u.screen_name || u.handle;
      if (!h) continue;
      sql.push(
        `INSERT OR REPLACE INTO similar_accounts (member_id, handle, name, avatar, reason, difference, created_at)
         VALUES (${lit(m.id)}, ${lit(h)}, ${lit(u.name)}, ${lit(u.profile_image_url_https || u.avatar || null)}, ${lit("官方相似推荐")}, NULL, ${lit(now)});`
      );
      total++;
    }
    ok++;
    console.log(`✓ ${users.length} 位`);
  } catch (error) {
    failures.push(`@${m.handle}: ${error.message}`);
    console.log(`✗ ${error.message}`);
  }
}
sql.push(`INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;`);
writeFileSync("/tmp/official-similar.sql", sql.join("\n\n") + "\n");
console.log(`\n完成：成员 ${ok}/${members.length}，官方相似 ${total} 条，写入 /tmp/official-similar.sql`);
if (failures.length) { console.log("失败："); for (const f of failures) console.log("  " + f); }