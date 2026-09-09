// 帖子活跃度数据同步（手动批量，非定时任务）：对名册活跃成员逐个拉取
// profile（拿数字 id_str，tweets 端点只认数字 ID）→ tweets 第一页（约 20 条），
// 生成 posts 表幂等 upsert（tweet_id 冲突时旧 views 挪进 views_prev）+ cache_bust +1，
// 输出 /tmp/posts.sql，用 wrangler d1 execute 灌入线上库。
// 任一成员失败时进程以非零码退出：&& 链不会把半截数据灌进线上库。
// 用法：node scripts/sync-posts.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/posts.sql
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSocialDataKey, createThrottledGet, lit, BUMP_CACHE_BUST_SQL } from "./_lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rosterDoc = JSON.parse(readFileSync(resolve(root, "data/members.json"), "utf-8"));
const roster = rosterDoc.members;
const apiKey = readSocialDataKey();
if (!apiKey) throw new Error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");

const throttledFetch = createThrottledGet(apiKey, 800);

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
      // 幂等 upsert（不用 REPLACE——REPLACE 删旧重建会丢 views_prev，与 src/collector.ts 同一套口径）
      sql.push(
        `INSERT INTO posts (tweet_id, member_id, created_at, views_count, views_prev, like_count, reply_count, retweet_count, quote_count, bookmark_count, text, lang, recorded_at)
         VALUES (${lit(t.id_str)}, ${lit(member.id)}, ${lit(t.tweet_created_at)}, ${t.views_count ?? "NULL"}, NULL, ${t.favorite_count ?? "NULL"}, ${t.reply_count ?? "NULL"}, ${t.retweet_count ?? "NULL"}, ${t.quote_count ?? "NULL"}, ${t.bookmark_count ?? "NULL"}, ${lit(t.full_text)}, ${lit(t.lang)}, ${lit(now)})
         ON CONFLICT(tweet_id) DO UPDATE SET
           views_count = excluded.views_count, views_prev = posts.views_count,
           like_count = excluded.like_count, reply_count = excluded.reply_count,
           retweet_count = excluded.retweet_count, quote_count = excluded.quote_count,
           bookmark_count = excluded.bookmark_count, text = excluded.text,
           lang = excluded.lang, recorded_at = excluded.recorded_at;`
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
sql.push(BUMP_CACHE_BUST_SQL);

writeFileSync("/tmp/posts.sql", sql.join("\n\n") + "\n");
console.log(`\n完成：成员 ${membersOk}/${roster.length}，帖子 ${tweetsTotal} 条，写入 /tmp/posts.sql`);
console.log(`执行：wrangler d1 execute kosx-impact --remote --file=/tmp/posts.sql`);
if (failures.length) {
  console.log("失败清单：");
  for (const f of failures) console.log("  " + f);
  process.exitCode = 1;
}
