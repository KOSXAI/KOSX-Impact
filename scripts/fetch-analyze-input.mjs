// 分析素材拉取：SocialData 拉指定成员的档案 + 最近帖子文本，输出供 agent 分析的 JSON。
// 模式同 run-grok-tracks 的前半段，但数据来自 SocialData API（结构化、按条计费），
// 分析由 agent 模型完成（不消耗 Grok Build 额度）。
// 用法：node scripts/fetch-analyze-input.mjs [handle...] [--out /tmp/analyze-input.json]
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 ? argv[outIdx + 1] : "/tmp/analyze-input.json";
const wantHandles = argv.filter((a) => !a.startsWith("--"));

const devVars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf-8") : "";
const apiKey =
  process.env.SOCIALDATA_API_KEY ?? devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
  process.exit(1);
}

const API_BASE = "https://api.socialdata.tools";
const MIN_INTERVAL_MS = 650;

let members = [];
if (wantHandles.length) {
  const out = execSync(
    `wrangler d1 execute kosx-impact --remote --json --command "SELECT id, handle FROM members WHERE status='active' AND handle IN (${wantHandles.map((h) => `'${h.replaceAll("'", "''")}'`).join(",")})"`,
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );
  members = JSON.parse(out).flatMap((r) => r.results ?? []);
} else {
  const out = execSync(
    `wrangler d1 execute kosx-impact --remote --json --command "SELECT id, handle FROM members WHERE status='active' ORDER BY handle"`,
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );
  members = JSON.parse(out).flatMap((r) => r.results ?? []);
}
console.log(`待拉取 ${members.length} 位成员素材，节流 ${MIN_INTERVAL_MS}ms`);

let lastRequestAt = 0;
async function get(path) {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchMaterial({ id, handle }) {
  const profile = await get(`/twitter/user/${encodeURIComponent(handle)}`);
  const userId = profile.id_str;
  const tweets = [];
  if (userId) {
    const page = await get(`/twitter/user/${encodeURIComponent(userId)}/tweets`);
    for (const t of Array.isArray(page.tweets) ? page.tweets : []) {
      if (t?.id_str && t.full_text) {
        tweets.push({ createdAt: t.tweet_created_at ?? null, text: t.full_text });
      }
    }
  }
  return {
    member_id: id,
    handle,
    displayName: profile.name ?? null,
    bio: profile.description ?? null,
    location: profile.location ?? null,
    url: profile.url ?? null,
    verified: profile.verified === true,
    followers: profile.followers_count ?? null,
    tweets: tweets.slice(0, 20),
  };
}

const out = [];
const failed = [];
for (let i = 0; i < members.length; i++) {
  const m = members[i];
  process.stdout.write(`[${i + 1}/${members.length}] @${m.handle} … `);
  try {
    out.push(await fetchMaterial(m));
    process.stdout.write(`✓ (${out[out.length - 1].tweets.length} 帖)\n`);
  } catch (e) {
    failed.push(`${m.handle}（${String(e).slice(0, 120)}）`);
    process.stdout.write(`✗\n`);
  }
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\n成功 ${out.length} 位，失败 ${failed.length} 位；产物: ${OUT}`);
if (failed.length) console.log("失败清单:\n" + failed.join("\n"));