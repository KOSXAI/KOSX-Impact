// 成员被提及同步（手动批量，非定时任务）：遍历全部活跃成员（读远程 DB 导出的 id/handle），
// 用 SocialData Search 按 `@handle -filter:replies` 拉「谁提到该成员」，写 member_mentions 表
// （(member_id, tweet_id) 幂等）+ cache_bust +1。零 profile 调用（复用 handle，不耗额外额度）。
// 用法：先导出成员表：
//   wrangler d1 execute kosx-impact --remote --command "SELECT id, handle, user_id FROM members WHERE status='active'" --json > /tmp/member-handles.json
// 再：
//   node scripts/sync-member-mentions.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/member-mentions.sql
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = readFileSync(resolve(root, ".dev.vars"), "utf-8").match(/SOCIALDATA_API_KEY=(\S+)/)?.[1];
if (!apiKey) throw new Error("SOCIALDATA_API_KEY not found in .dev.vars");
if (!existsSync("/tmp/member-handles.json")) {
  throw new Error("缺少 /tmp/member-handles.json，先按文件头注释导出成员表");
}
const members = JSON.parse(readFileSync("/tmp/member-handles.json", "utf-8"));
const selfHandle = (m) => m.handle.toLowerCase();

const API_BASE = "https://api.socialdata.tools";
let lastAt = 0;
async function throttledFetch(path) {
  const wait = lastAt + 800 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt = Date.now();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const lit = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const now = new Date().toISOString();
const sql = [];
let membersOk = 0;
let mentionsTotal = 0;
const failures = [];

for (const member of members) {
  const handle = member.handle;
  process.stdout.write(`@${handle} … `);
  try {
    // 被提及 = 别人发的、提到 @handle 的帖子（排除 replies 噪音，剔除本人自提）
    const query = encodeURIComponent(`@${handle} -filter:replies`);
    const page = await throttledFetch(`/twitter/search?query=${query}&type=Latest`);
    const tweets = Array.isArray(page.tweets) ? page.tweets : [];
    let kept = 0;
    for (const t of tweets) {
      if (!t.id_str) continue;
      const author = (t.user?.screen_name || t.author_handle || t.author_username || "").toLowerCase();
      if (author === selfHandle(member)) continue; // 本人自提不算「被提及」
      sql.push(
        `INSERT OR REPLACE INTO member_mentions (member_id, tweet_id, author_handle, author_name, text, mentioned_at, collected_at)
         VALUES (${lit(member.id)}, ${lit(t.id_str)}, ${lit(t.user?.screen_name || t.author_handle || null)}, ${lit(t.user?.name || t.author_name || null)}, ${lit(t.full_text)}, ${lit(t.tweet_created_at)}, ${lit(now)});`
      );
      kept++;
    }
    membersOk++;
    mentionsTotal += kept;
    console.log(`✓ ${kept} 条`);
  } catch (error) {
    failures.push(`@${handle}: ${error.message}`);
    console.log(`✗ ${error.message}`);
  }
}

sql.push(`INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;`);

writeFileSync("/tmp/member-mentions.sql", sql.join("\n\n") + "\n");
console.log(`\n完成：成员 ${membersOk}/${members.length}，被提及 ${mentionsTotal} 条，写入 /tmp/member-mentions.sql`);
console.log(`执行：wrangler d1 execute kosx-impact --remote --file=/tmp/member-mentions.sql`);
if (failures.length) {
  console.log("失败清单：");
  for (const f of failures) console.log("  " + f);
}
