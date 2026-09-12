// 帖子富媒体回填（一次性）：为已入库帖子补齐 media / tweet_type / quoted 三列。
// 复用 members.user_id（数字 ID 已持久化，零 profile 调用），只拉每个活跃成员最近一页帖子，
// 按 tweet_id 生成 UPDATE 语句（不动互动数/正文，纯补展示字段），输出 /tmp/media.sql。
// 媒体本就在 User Tweets 响应里，本次仅为历史行补列，属正常刷新成本。
// 用法：node scripts/backfill-media.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/media.sql
import { writeFileSync } from "node:fs";
import { readSocialDataKey, createThrottledGet, lit, jsonOrNull, extractMedia, extractQuoted, d1Query, BUMP_CACHE_BUST_SQL } from "./_lib.mjs";

const apiKey = readSocialDataKey();
if (!apiKey) throw new Error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
const throttledFetch = createThrottledGet(apiKey, 800);

// 只回填有帖子数据的活跃成员
const members = d1Query(
  `SELECT m.id, m.user_id AS userId FROM members m WHERE m.status = 'active' AND m.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM posts p WHERE p.member_id = m.id)`
);
console.log(`待回填成员：${members.length} 位`);

const sql = [];
let mediaPosts = 0, quotedPosts = 0, scanned = 0, failed = 0;

for (const m of members) {
  try {
    const page = await throttledFetch(`/twitter/user/${m.userId}/tweets`);
    const tweets = Array.isArray(page.tweets) ? page.tweets : [];
    for (const t of tweets) {
      if (!t.id_str) continue;
      scanned++;
      const media = extractMedia(t);
      const quoted = extractQuoted(t);
      if (media) mediaPosts++;
      if (quoted) quotedPosts++;
      sql.push(
        `UPDATE posts SET media = ${jsonOrNull(media)}, tweet_type = ${lit(t.type)}, quoted = ${jsonOrNull(quoted)}
         WHERE tweet_id = ${lit(t.id_str)};`
      );
    }
    process.stdout.write(`@${m.id} ✓ ${tweets.length} 帖\n`);
  } catch (error) {
    failed++;
    process.stdout.write(`@${m.id} ✗ ${error.message}\n`);
  }
}

// 回填也是数据变更：cache_bust +1，读端点缓存键换新
sql.push(BUMP_CACHE_BUST_SQL);
writeFileSync("/tmp/media.sql", sql.join("\n") + "\n");
console.log(`\n扫描 ${scanned} 帖：带媒体 ${mediaPosts}、引用帖 ${quotedPosts}，失败成员 ${failed}`);
console.log(`执行：wrangler d1 execute kosx-impact --remote --file=/tmp/media.sql`);
