// 一次性回填脚本：从 SocialData 拉取缺失 displayName 成员的 X 显示名，
// 生成更新后的名册（data/members.json）与 D1 UPDATE 语句（/tmp/backfill-displaynames.sql）
// 用法：node scripts/backfill-displaynames.mjs
// 注意：本机访问 SocialData 需走代理 -x http://127.0.0.1:7890
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const roster = JSON.parse(readFileSync(resolve(root, "data/members.json"), "utf-8"));
const envVars = readFileSync(resolve(root, ".dev.vars"), "utf-8");
const apiKey = envVars.match(/SOCIALDATA_API_KEY=(\S+)/)?.[1];
if (!apiKey) throw new Error("SOCIALDATA_API_KEY not found in .dev.vars");

const proxy = process.env.HTTP_PROXY || "http://127.0.0.1:7890";
const dispatcher = new (await import("undici")).ProxyAgent(proxy);

const missing = roster.members.filter((m) => !m.displayName);
console.log(`缺失 displayName 的成员：${missing.length} 位`);

let first = true;
const updates = [];
for (const m of missing) {
  if (!first) await new Promise((r) => setTimeout(r, 21_000)); // 尊重免费额度每分钟 3 次
  first = false;
  const res = await fetch(`https://api.socialdata.tools/twitter/user/${encodeURIComponent(m.handle)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    dispatcher,
  });
  if (!res.ok) {
    console.error(`@${m.handle} HTTP ${res.status}: ${await res.text()}`);
    continue;
  }
  const data = await res.json();
  const name = data.name; // Twitter 用户资料显示名
  console.log(`@${m.handle} -> ${name}`);
  if (name) {
    m.displayName = name;
    updates.push(`UPDATE members SET display_name = '${String(name).replace(/'/g, "''")}' WHERE id = '${m.id}';`);
  }
}

// 名册是追踪名单的事实来源：直接写回 data/members.json
writeFileSync(resolve(root, "data/members.json"), JSON.stringify(roster, null, 2) + "\n");
writeFileSync(resolve("/tmp", "backfill-displaynames.sql"), updates.join("\n") + "\n");
console.log(`\n名册已更新；${updates.length} 条 UPDATE -> /tmp/backfill-displaynames.sql`);
