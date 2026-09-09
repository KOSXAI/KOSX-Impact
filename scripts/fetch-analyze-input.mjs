// 分析素材拉取（纯库读版，零 SocialData 调用）：从 members 表读档案、posts 表读最近帖子，
// 输出供 agent 分析的 JSON。档案与帖子文本都是每日采集已入库的数据，无需重复调 API。
// 用法：node scripts/fetch-analyze-input.mjs [handle...] [--out /tmp/analyze-input.json]
import { writeFileSync } from "node:fs";
import { d1Query } from "./_lib.mjs";

const argv = process.argv.slice(2);
const take = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : def;
};
const OUT = take("--out", "/tmp/analyze-input.json");
const wantHandles = argv.filter((a) => !a.startsWith("--") && a !== "--out" && argv[argv.indexOf(a) - 1] !== "--out");

let members = [];
if (wantHandles.length) {
  members = d1Query(
    `SELECT id, handle FROM members WHERE status='active' AND handle IN (${wantHandles.map((h) => `'${h.replaceAll("'", "''")}'`).join(",")})`
  );
} else {
  members = d1Query(`SELECT id, handle FROM members WHERE status='active' ORDER BY handle`);
}
console.log(`待拉取 ${members.length} 位成员素材（纯库读，零 SocialData 请求）`);

const out = [];
for (const m of members) {
  // 档案（members 表最新值，每日采集已入库）
  const rec =
    d1Query(
      `SELECT m.display_name AS displayName, m.bio, m.location, m.url, m.verified, (SELECT followers FROM snapshots WHERE member_id = m.id ORDER BY recorded_at DESC LIMIT 1) AS followers FROM members m WHERE m.id = '${m.id.replaceAll("'", "''")}'`
    )[0] ?? {};

  // 最近帖子（posts 表 90 天全文，每日采集已入库）
  const postsRes = d1Query(
    `SELECT created_at AS createdAt, text FROM posts WHERE member_id = '${m.id.replaceAll("'", "''")}' ORDER BY created_at DESC LIMIT 20`
  );

  out.push({
    member_id: m.id,
    handle: m.handle,
    displayName: rec.displayName ?? null,
    bio: rec.bio ?? null,
    location: rec.location ?? null,
    url: rec.url ?? null,
    verified: rec.verified === 1,
    followers: typeof rec.followers === "number" ? rec.followers : null,
    tweets: postsRes.map((t) => ({ createdAt: t.createdAt, text: t.text })),
  });
  process.stdout.write(`✓ @${m.handle} (${postsRes.length} 帖)\n`);
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\n成功 ${out.length} 位；产物: ${OUT}（零 SocialData 请求）`);