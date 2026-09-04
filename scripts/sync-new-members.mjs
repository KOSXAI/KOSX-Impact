// 新成员入职同步：名册中还没有历史快照的成员（新增的），从 SocialData 拉取
// 当前粉丝数与头像，生成 members INSERT + 当日快照 + 头像 UPDATE，输出到 /tmp/onboard.sql
// 用法：node scripts/sync-new-members.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/onboard.sql
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "undici";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roster = JSON.parse(readFileSync(resolve(root, "data/members.json"), "utf-8")).members;
const apiKey = readFileSync(resolve(root, ".dev.vars"), "utf-8").match(/SOCIALDATA_API_KEY=(\S+)/)?.[1];
if (!apiKey) throw new Error("SOCIALDATA_API_KEY not found in .dev.vars");

// 已有快照的成员（本地采集过），新成员不在其中
const dbJson = execSync("wrangler d1 execute kosx-impact --remote --json --command 'SELECT DISTINCT member_id FROM snapshots'", {
  encoding: "utf-8",
});
const collected = new Set(
  JSON.parse(dbJson).flatMap((r) => r.results ?? []).flatMap((r) => r.member_id ?? [])
);
const pending = roster.filter((m) => !collected.has(m.id));
console.log(`名册 ${roster.length} 位，已有快照 ${collected.size} 位，待入职 ${pending.length} 位`);

if (pending.length === 0) {
  console.log("没有需要入职的新成员");
  process.exit(0);
}

const proxy = process.env.HTTP_PROXY || "http://127.0.0.1:7890";
const dispatcher = new ProxyAgent(proxy);
const now = new Date().toISOString();
const sql = [];

for (let i = 0; i < pending.length; i++) {
  const m = pending[i];
  if (i > 0) await new Promise((r) => setTimeout(r, 21_000)); // 免费额度每分钟 3 次
  const res = await fetch(`https://api.socialdata.tools/twitter/user/${encodeURIComponent(m.handle)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    dispatcher,
  });
  if (!res.ok) {
    console.error(`✗ @${m.handle} HTTP ${res.status}（跳过，添加失败需人工确认 handle）`);
    continue;
  }
  const data = await res.json();
  const followers = data.followers_count;
  const img = data.profile_image_url_https?.replace("_normal.", "_400x400.");
  console.log(`✓ @${m.handle} -> ${followers} 粉`);
  sql.push(
    `INSERT INTO members (id, handle, display_name, status, goal, joined_at, profile_image) VALUES ('${m.id}', '${m.handle}', NULL, 'active', ${m.goal ?? 10000}, '${m.joinedAt}', ${img ? `'${img}'` : "NULL"})\n  ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, profile_image = excluded.profile_image;`,
    `INSERT INTO snapshots (member_id, followers, recorded_at) VALUES ('${m.id}', ${followers}, '${now}');`
  );
}

writeFileSync("/tmp/onboard.sql", sql.join("\n\n") + "\n");
console.log(`\n生成 /tmp/onboard.sql（${sql.length / 2} 位）——执行：wrangler d1 execute kosx-impact --remote --file=/tmp/onboard.sql`);
