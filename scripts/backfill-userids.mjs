// 补齐存量成员 user_id（X 数字用户 ID）：collector 改造后新采集自动写入，
// 这里用 SocialData bulk profiles 一次性把现有 active 成员补齐（免等 24h 滚动采集）。
// 用法：node scripts/backfill-userids.mjs [--apply]
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const devVars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf-8") : "";
const apiKey =
  process.env.SOCIALDATA_API_KEY ?? devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
  process.exit(1);
}

// 待补齐：线上 active 且 user_id 为空的成员
const out = execSync(
  `wrangler d1 execute kosx-impact --remote --json --command "SELECT id, handle FROM members WHERE status='active' AND (user_id IS NULL OR user_id = '') ORDER BY handle"`,
  { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
);
const members = JSON.parse(out).flatMap((r) => r.results ?? []);
console.log(`待补齐 ${members.length} 位成员 user_id`);

if (members.length === 0) {
  console.log("没有需要补齐的成员，跳过");
  process.exit(0);
}

const byId = new Map(members.map((m) => [m.id, m.handle]));

async function bulkByUsernames(usernames) {
  const res = await fetch("https://api.socialdata.tools/twitter/users-by-username", {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ usernames }),
  });
  if (!res.ok) throw new Error(`bulk HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const BATCH = 100;
const found = new Map(); // handle -> id_str
let attempts = 0;
for (let i = 0; i < members.length; i += BATCH) {
  const batch = members.slice(i, i + BATCH).map((m) => m.handle);
  try {
    const data = await bulkByUsernames(batch);
    attempts++;
    // 响应结构：{ users: [{ screen_name, id_str, ... }] }（兼容单用户回包 users 数组）
    for (const u of Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : []) {
      if (u?.screen_name && u?.id_str) found.set(u.screen_name.toLowerCase(), u.id_str);
    }
    process.stdout.write(`[batch ${Math.floor(i / BATCH) + 1}] ✓ ${batch.length} 人\n`);
  } catch (e) {
    console.error(`batch ${Math.floor(i / BATCH) + 1} 失败：${String(e).slice(0, 200)}`);
  }
}

console.log(`bulk 命中 ${found.size} 位（${attempts} 次请求）`);
const missing = members.filter((m) => !found.has(m.handle.toLowerCase())).map((m) => m.handle);
if (missing.length) console.log("bulk 未命中，逐个 profile 兜底:", missing.join(", "));

// 兜底：bulk 漏掉的逐个 profile（单点失败不影响整体）
let lastRequestAt = 0;
async function profileGet(handle) {
  const wait = lastRequestAt + 650 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(`https://api.socialdata.tools/twitter/user/${encodeURIComponent(handle)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
for (const handle of missing) {
  try {
    const p = await profileGet(handle);
    if (p?.id_str) found.set(handle.toLowerCase(), p.id_str);
  } catch {
    /* 跳过，留待下次采集自动补 */
  }
}

// 写入 SQL（幂等）
if (APPLY && found.size) {
  const rows = [];
  for (const m of members) {
    const uid = found.get(m.handle.toLowerCase());
    if (uid) rows.push(`UPDATE members SET user_id = '${uid.replaceAll("'", "''")}' WHERE id = '${m.id.replaceAll("'", "''")}';`);
  }
  if (rows.length) {
    const sqlPath = "/tmp/backfill-userids.sql";
    writeFileSync(sqlPath, rows.join("\n"));
    execSync(`wrangler d1 execute kosx-impact --remote --file=${sqlPath}`, { stdio: "inherit", maxBuffer: 10 * 1024 * 1024 });
    console.log(`已写入 ${rows.length} 位 user_id`);
  }
}

writeFileSync("/tmp/backfill-userids.json", JSON.stringify({ found: [...found.entries()], missing }, null, 2));
console.log(`产物: /tmp/backfill-userids.json；未补齐: ${members.length - found.size} 位（下次采集自动补）`);