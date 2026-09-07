// 帖子活跃度数据同步（手动批量，非定时任务）：对名册活跃成员逐个拉取
// profile（拿数字 id_str，tweets 端点只认数字 ID）→ tweets 第一页（约 20 条），
// 生成 posts 表 INSERT OR REPLACE（tweet_id 幂等）+ cache_bust +1，
// 输出 /tmp/posts.sql，用 wrangler d1 execute 灌入线上库。
// 用法：node scripts/sync-posts.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/posts.sql
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rosterDoc = JSON.parse(readFileSync(resolve(root, "data/members.json"), "utf-8"));
const roster = rosterDoc.members;
const apiKey = readFileSync(resolve(root, ".dev.vars"), "utf-8").match(/SOCIALDATA_API_KEY=(\S+)/)?.[1];
if (!apiKey) throw new Error("SOCIALDATA_API_KEY not found in .dev.vars");

const API_BASE = "https://api.socialdata.tools";
let lastAt = 0;
async function throttledFetch(path) {
  // 800ms 间隔远低于 130 req/min 限流；tweets 端点必返回数据并计费（$0.0002/帖），
  // 节流只防误触限流，不省成本
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

// SQL 字面量转义（单引号翻倍）；null 转 NULL
const lit = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const now = new Date().toISOString();
const sql = [];
let membersOk = 0;
let tweetsTotal = 0;
const failures = [];

for (const member of roster) {
  process.stdout.write(`@${member.handle} … `);
  try {
    const profile = await throttledFetch(`/twitter/user/${encodeURIComponent(member.handle)}`);
    if (!profile.id_str) throw new Error("profile 无 id_str");
    const page = await throttledFetch(`/twitter/user/${profile.id_str}/tweets`);
    const tweets = Array.isArray(page.tweets) ? page.tweets : [];
    for (const t of tweets) {
      if (!t.id_str) continue;
      sql.push(
        `INSERT OR REPLACE INTO posts (tweet_id, member_id, created_at, views_count, like_count, reply_count, retweet_count, quote_count, bookmark_count, text, lang, recorded_at)
         VALUES (${lit(t.id_str)}, ${lit(member.id)}, ${lit(t.tweet_created_at)}, ${t.views_count ?? "NULL"}, ${t.favorite_count ?? "NULL"}, ${t.reply_count ?? "NULL"}, ${t.retweet_count ?? "NULL"}, ${t.quote_count ?? "NULL"}, ${t.bookmark_count ?? "NULL"}, ${lit(t.full_text)}, ${lit(t.lang)}, ${lit(now)});`
      );
    }
    membersOk++;
    tweetsTotal += tweets.length;
    const first = tweets[0] ?? {};
    console.log(`✓ ${tweets.length} 帖（最新 ${(first.tweet_created_at ?? "?").slice(0, 10)}）`);
  } catch (error) {
    failures.push(`@${member.handle}: ${error.message}`);
    console.log(`✗ ${error.message}`);
  }
}

// 新数据可见性：采集写库后 cache_bust +1，读端点缓存键换新，各数据中心立即可见
sql.push(`INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;`);

writeFileSync("/tmp/posts.sql", sql.join("\n\n") + "\n");
console.log(`\n完成：成员 ${membersOk}/${roster.length}，帖子 ${tweetsTotal} 条，写入 /tmp/posts.sql`);
console.log(`执行：wrangler d1 execute kosx-impact --remote --file=/tmp/posts.sql`);
if (failures.length) {
  console.log("失败清单：");
  for (const f of failures) console.log("  " + f);
}
