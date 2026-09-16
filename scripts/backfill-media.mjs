// 帖子富媒体回填：为已入库帖子补齐 media / tweet_type / quoted 三列。
// 复用 members.user_id（数字 ID 已持久化，零 profile 调用），拉取需要补列的成员帖子并翻页，
// 按 tweet_id 生成 UPDATE 语句（不动互动数/正文，纯补展示字段），输出 /tmp/media.sql。
// 媒体本就在 User Tweets 响应里，本次仅为历史行补列，属正常刷新成本。
// 默认只翻 1 页（够新鲜数据）；--deep 翻到覆盖 30 天窗口，给高产作者补全（一次可重复跑，幂等）。
// 用法：node scripts/backfill-media.mjs [--deep] && wrangler d1 execute kosx-impact --remote --file=/tmp/media.sql
import { writeFileSync } from "node:fs";
import { readSocialDataKey, createThrottledGet, lit, jsonOrNull, extractMedia, extractQuoted, d1Query, BUMP_CACHE_BUST_SQL } from "./_lib.mjs";

const apiKey = readSocialDataKey();
if (!apiKey) throw new Error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
const throttledFetch = createThrottledGet(apiKey);

const deep = process.argv.includes("--deep");
// 30 天窗口起点：翻页翻到这个时间之前就停（再多对配方无用）
const windowStart = Date.now() - 30 * 86_400_000;
const MAX_PAGES = deep ? 10 : 1;

// 待回填成员：只挑仍有未补齐帖子的（全量重扫没必要，翻页很贵）。
// 日常采集已写入 media/tweet_type/quoted，无缺口时这个列表就该是空的——
// 旧版默认模式对任何有帖成员都拉一页，等于每次重跑都为已有数据付费。
const members = d1Query(
  deep
    ? `SELECT m.id, m.user_id AS userId FROM members m WHERE m.status = 'active' AND m.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM posts p WHERE p.member_id = m.id AND p.created_at >= '${new Date(windowStart).toISOString()}' AND p.tweet_type IS NULL)`
    : `SELECT m.id, m.user_id AS userId FROM members m WHERE m.status = 'active' AND m.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM posts p WHERE p.member_id = m.id AND p.tweet_type IS NULL)`
);
console.log(`待回填成员：${members.length} 位${deep ? "（深度模式：翻页覆盖近 30 天）" : ""}`);

const sql = [];
let mediaPosts = 0, quotedPosts = 0, scanned = 0, failed = 0;
let pages = 0;

for (const m of members) {
  try {
    let cursor = null;
    let fetched = 0;
    for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
      const path = `/twitter/user/${m.userId}/tweets${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = await throttledFetch(path);
      pages++;
      const tweets = Array.isArray(page.tweets) ? page.tweets : [];
      if (tweets.length === 0) break;
      let oldest = null;
      for (const t of tweets) {
        if (!t.id_str) continue;
        scanned++;
        fetched++;
        const media = extractMedia(t);
        const quoted = extractQuoted(t);
        if (media) mediaPosts++;
        if (quoted) quotedPosts++;
        // COALESCE：响应缺字段（降级返回）时不把已采到的好值覆盖成 NULL
        sql.push(
          `UPDATE posts SET media = COALESCE(${jsonOrNull(media)}, media),
                            tweet_type = COALESCE(${lit(t.type)}, tweet_type),
                            quoted = COALESCE(${jsonOrNull(quoted)}, quoted)
           WHERE tweet_id = ${lit(t.id_str)};`
        );
        // 置顶帖排在首页最前但日期很旧，不能计入「本页最老」——否则翻页会提前中止
        if (t.is_pinned) continue;
        const at = t.tweet_created_at ? Date.parse(t.tweet_created_at) : null;
        if (at && (oldest === null || at < oldest)) oldest = at;
      }
      cursor = page.next_cursor ?? null;
      // 翻到 30 天窗口之外就没必要继续（再老的帖子不进配方/精华帖）
      if (!cursor || (oldest !== null && oldest < windowStart)) break;
    }
    process.stdout.write(`@${m.id} ✓ ${fetched} 帖\n`);
  } catch (error) {
    failed++;
    process.stdout.write(`@${m.id} ✗ ${error.message}\n`);
  }
}

// 回填也是数据变更：cache_bust +1，读端点缓存键换新
sql.push(BUMP_CACHE_BUST_SQL);
writeFileSync("/tmp/media.sql", sql.join("\n") + "\n");
console.log(`\n请求 ${pages} 页，扫描 ${scanned} 帖：带媒体 ${mediaPosts}、引用帖 ${quotedPosts}，失败成员 ${failed}`);
console.log(`执行：wrangler d1 execute kosx-impact --remote --file=/tmp/media.sql`);
// 有失败成员即非零退出：README 承诺「失败项非零码退出，&& 链不会灌半截数据」
if (failed > 0) {
  console.error(`\n${failed} 位成员拉取失败，产物不完整——确认后重跑补齐再执行 SQL`);
  process.exitCode = 1;
}
