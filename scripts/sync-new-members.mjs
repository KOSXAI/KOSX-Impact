// 新成员入职同步：名册中还没有历史快照的成员（新增的），从 SocialData 拉取
// 当前粉丝数、X 显示名与头像，生成 members INSERT + 当日快照 + 头像 UPDATE，
// 输出到 /tmp/onboard.sql；显示名同时回写进名册（事实来源保持完整，随 PR 一并提交）
// 用法：node scripts/sync-new-members.mjs && wrangler d1 execute kosx-impact --remote --file=/tmp/onboard.sql
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "undici";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rosterDoc = JSON.parse(readFileSync(resolve(root, "data/members.json"), "utf-8"));
const roster = rosterDoc.members;
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
let nameBackfilled = 0;

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
  // 姓名：名册没填时用 X 显示名补齐——名册是事实来源，若名册留空，
  // 下次采集同步（syncRoster）会用 NULL 覆盖数据库里的昵称，看板就退化成 handle
  if (!m.displayName && data.name) {
    m.displayName = data.name;
    nameBackfilled++;
  }
  const name = m.displayName ?? null;
  const nameSql = name ? `'${String(name).replace(/'/g, "''")}'` : "NULL";
  // 档案字段随首快照一并落库：等下一次滚动分片要等最多 24 小时，入职当天就该有完整档案卡
  const text = (v) => (v ? `'${String(v).replace(/'/g, "''")}'` : "NULL");
  const profile = {
    bio: text(data.description),
    location: text(data.location),
    url: text(data.url),
    banner: text(data.profile_banner_url),
    xCreatedAt: text(data.created_at),
    verified: data.verified === true ? 1 : data.verified === false ? 0 : "NULL",
  };
  console.log(`✓ @${m.handle} -> ${followers} 粉${name ? ` · ${name}` : "（无显示名，请人工补充 displayName）"}`);
  sql.push(
    `INSERT INTO members (id, handle, display_name, status, joined_at, profile_image, bio, location, url, banner_url, x_created_at, verified)
     VALUES ('${m.id}', '${m.handle}', ${nameSql}, 'active', '${m.joinedAt}', ${img ? `'${img}'` : "NULL"}, ${profile.bio}, ${profile.location}, ${profile.url}, ${profile.banner}, ${profile.xCreatedAt}, ${profile.verified})
  ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, display_name = excluded.display_name, profile_image = excluded.profile_image,
     bio = COALESCE(excluded.bio, bio), location = COALESCE(excluded.location, location), url = COALESCE(excluded.url, url),
     banner_url = COALESCE(excluded.banner_url, banner_url), x_created_at = COALESCE(excluded.x_created_at, x_created_at),
     verified = COALESCE(excluded.verified, verified);`,
    `INSERT INTO snapshots (member_id, followers, following, posts, listed_count, favourites_count, recorded_at)
     VALUES ('${m.id}', ${followers}, ${data.friends_count ?? "NULL"}, ${data.statuses_count ?? "NULL"}, ${data.listed_count ?? "NULL"}, ${data.favourites_count ?? "NULL"}, '${now}');`
  );
}

// 回写名册：补到的显示名随本 PR 一并提交，保持可审查、与数据库一致
if (nameBackfilled > 0) {
  writeFileSync(resolve(root, "data/members.json"), JSON.stringify(rosterDoc, null, 2) + "\n");
  console.log(`\n名册已回写 ${nameBackfilled} 个显示名（data/members.json，随本次 PR 提交）`);
}

writeFileSync("/tmp/onboard.sql", sql.join("\n\n") + "\n");
console.log(`\n生成 /tmp/onboard.sql（${sql.length / 2} 位）——执行：wrangler d1 execute kosx-impact --remote --file=/tmp/onboard.sql`);
