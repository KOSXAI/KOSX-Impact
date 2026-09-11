#!/usr/bin/env node
// 社群内部关注网采集（低频手动 / cron 兜底）：对名册活跃成员逐个拉 Following 列表
// （SocialData Following 端点，$0.0002/页），把「成员 → 成员」的边 upsert 进 follows 表。
// 产物输出 /tmp/follows.sql，用 wrangler d1 execute --file 灌库（与 sync-posts 同流程）。
// 成本估算：84 人 × 平均 N 页（每页 ~20 关注）——每两周一轮，月成本约 $1-3。
// 用法：node scripts/sync-follows.mjs [--pages=60] && wrangler d1 execute kosx-impact --remote --file=/tmp/follows.sql
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSocialDataKey, createThrottledGet, lit, d1Query, BUMP_CACHE_BUST_SQL } from "./_lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = readSocialDataKey();
if (!apiKey) throw new Error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");

const maxPagesArg = process.argv.find((a) => a.startsWith("--pages="));
const MAX_PAGES = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : 60;

const throttledFetch = createThrottledGet(apiKey, 800);
const now = new Date().toISOString();
const sql = [];
const failures = [];
let edgesTotal = 0;

// user_id 落在 members 表（0015）：一次查全量 active 成员的 handle ↔ 数字 ID 映射，
// 名册不在表里等于还没建档，跳过。目标关注对象同样按这套数字 ID 判定。
const results = d1Query(
  "SELECT id, handle, user_id FROM members WHERE status = 'active' AND user_id IS NOT NULL"
);
const byId = new Map(results.map((r) => [String(r.user_id), r.id]));
console.log(`active 成员（含 user_id）：${results.length} 位`);

for (const r of results) {
  process.stdout.write(`@${r.handle} … `);
  try {
    let cursor;
    let pages = 0;
    let edges = 0;
    for (;;) {
      const page = await throttledFetch(
        `/twitter/user/${r.user_id}/following${cursor ? `?cursor=${cursor}` : ""}`
      );
      const users = Array.isArray(page.users) ? page.users : [];
      for (const u of users) {
        const followedId = u.id_str ?? u.id;
        if (!followedId || String(followedId) === String(r.user_id)) continue;
        const toMemberId = byId.get(String(followedId));
        if (!toMemberId) continue; // 名册外的关注不入表
        sql.push(
          `INSERT INTO follows (follower_user_id, followed_user_id, synced_at)
           VALUES (${lit(String(r.user_id))}, ${lit(String(followedId))}, ${lit(now)})
           ON CONFLICT(follower_user_id, followed_user_id) DO UPDATE SET synced_at = excluded.synced_at;`
        );
        edges++;
        edgesTotal++;
      }
      pages++;
      cursor = page.next_cursor;
      if (!cursor || pages >= MAX_PAGES) break;
    }
    console.log(`✓ ${edges} 边（${pages} 页）`);
  } catch (error) {
    failures.push(`@${r.handle}: ${error.message}`);
    console.log(`✗ ${error.message}`);
  }
}

sql.push(BUMP_CACHE_BUST_SQL);
writeFileSync("/tmp/follows.sql", sql.join("\n\n") + "\n");
console.log(
  `\n完成：${results.length - failures.length}/${results.length} 人成功，共 ${edgesTotal} 条成员内关注边 → /tmp/follows.sql`
);
if (failures.length > 0) {
  console.error("失败清单：\n" + failures.join("\n"));
  process.exit(1);
}
