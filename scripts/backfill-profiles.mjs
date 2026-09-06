// 存量成员档案补录：bio/location/banner 等档案字段随 0008 迁移上线，只有采集（或自助更新）
// 触到该成员时才会从 SocialData 响应落库；滚动分片一轮 24 小时，新迁移上线后存量成员要等一天。
// 本脚本对缺档案的活跃成员逐个 POST /api/refresh（与网页自助更新同一条官方管线：
// 真实 SocialData 数据 → 快照/登阶/日聚合/cache_bust），间隔 22 秒保证每次都抢到 21s CAS
// 节流槽（当场处理，不落队列），也落在每分钟 3 次免费额度内。
// 用法：node scripts/backfill-profiles.mjs
import { execSync } from "node:child_process";

const SITE = "https://impact.kosx.ai";

const dbJson = execSync(
  "wrangler d1 execute kosx-impact --remote --json --command \"SELECT id, handle FROM members WHERE status='active' AND bio IS NULL ORDER BY id\"",
  { encoding: "utf-8" }
);
const pending = JSON.parse(dbJson)
  .flatMap((r) => r.results ?? [])
  .map((r) => ({ id: r.id, handle: r.handle }));

console.log(`缺档案成员 ${pending.length} 位，开始补录（每位间隔 22s，约 ${Math.ceil((pending.length * 24) / 60)} 分钟）`);
if (pending.length === 0) process.exit(0);

let done = 0;
let queued = 0;
const failed = [];
for (const m of pending) {
  let res;
  try {
    res = await fetch(`${SITE}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: m.handle }),
    });
  } catch (error) {
    failed.push(`@${m.handle}: ${error}`);
    console.error(`✗ @${m.handle} 请求失败：${error}`);
    await new Promise((r) => setTimeout(r, 22_000));
    continue;
  }
  const body = await res.json().catch(() => ({}));
  if (body.status === "done") {
    done++;
    console.log(`✓ @${m.handle} -> ${body.followersAfter ?? "?"} 粉（已入库）`);
  } else if (body.status === "queued" || body.status === "throttled") {
    queued++;
    console.log(`… @${m.handle} 落队列（${body.status}），由 cron 兜底`);
  } else {
    failed.push(`@${m.handle}: HTTP ${res.status} ${JSON.stringify(body)}`);
    console.error(`✗ @${m.handle} HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  await new Promise((r) => setTimeout(r, 22_000));
}

console.log(`\n完成：即时入库 ${done}，落队列 ${queued}，失败 ${failed.length}`);
if (failed.length > 0) {
  console.log("失败清单：");
  for (const f of failed) console.log("  " + f);
}
