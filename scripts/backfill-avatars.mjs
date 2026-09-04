// 一次性回填脚本：从 SocialData 拉取现有成员头像 URL，生成 SQL 供 wrangler d1 execute 执行
// 用法：node scripts/backfill-avatars.mjs
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

let first = true;
const updates = [];
for (const m of roster.members) {
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
  const img = data.profile_image_url_https;
  console.log(`@${m.handle} ->`, img);
  if (img) updates.push(`UPDATE members SET profile_image = '${img.replace(/'/g, "''")}' WHERE id = '${m.id}';`);
}

const sql = updates.join("\n") + "\n";
writeFileSync("/tmp/backfill-avatars.sql", sql);
console.log(`\n${updates.length} rows -> /tmp/backfill-avatars.sql`);
