// 粉丝圈画像采样：SocialData followers 端点对全成员拉头部粉丝样本（约 200 人/账号），
// 聚合粉丝质量指标（KOL 浓度 / 认证率 / 活跃度）入库 fan_profiles（月度低频刷新）。
// 需先调 profile 拿数字 ID（followers 端点只认 ID）；采样节流 650ms（~92 req/min < 120 共享上限）。
// 用法：node scripts/fetch-followers-sample.mjs [--apply] [--size 200] [handle...]
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const sizeIdx = argv.indexOf("--size");
const SAMPLE_SIZE = sizeIdx >= 0 ? parseInt(argv[sizeIdx + 1], 10) : 200;
const wantHandles = argv.filter((a) => !a.startsWith("--"));

// API key：.dev.vars 或环境变量
const devVars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf-8") : "";
const apiKey =
  process.env.SOCIALDATA_API_KEY ??
  devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim();
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
console.log(`待采样 ${members.length} 位成员，目标 ${SAMPLE_SIZE} 粉丝/账号，节流 ${MIN_INTERVAL_MS}ms`);

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

/** 拉某成员粉丝样本：profile 拿 ID → followers 翻页直到 SAMPLE_SIZE */
async function sampleFollowers(handle) {
  const profile = await get(`/twitter/user/${encodeURIComponent(handle)}`);
  const userId = profile.id_str;
  if (!userId) throw new Error("profile 无 id_str");
  const users = [];
  let cursor = "";
  const seen = new Set();
  while (users.length < SAMPLE_SIZE) {
    const page = await get(
      `/twitter/user/${encodeURIComponent(userId)}/followers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
    );
    const batch = Array.isArray(page.users) ? page.users : [];
    for (const u of batch) {
      if (u?.id_str && !seen.has(u.id_str)) {
        seen.add(u.id_str);
        users.push(u);
      }
    }
    if (!page.next_cursor || batch.length === 0) break;
    cursor = page.next_cursor;
  }
  return { users: users.slice(0, SAMPLE_SIZE), userId };
}

function aggregate(users, now) {
  const n = users.length;
  if (n === 0) return null;
  const avg = (fn) => users.reduce((s, u) => s + (fn(u) ?? 0), 0) / n;
  const pct = (fn) => (users.filter((u) => fn(u)).length / n) * 100;
  const top = [...users]
    .sort((a, b) => (b.followers_count ?? 0) - (a.followers_count ?? 0))
    .slice(0, 20)
    .map((u) => ({
      handle: u.screen_name ?? u.username ?? u.id_str,
      name: u.name ?? null,
      followers: u.followers_count ?? 0,
    }));
  return {
    sample_size: n,
    avg_followers: Math.round(avg((u) => u.followers_count)),
    pct_followers_1k: Math.round(pct((u) => (u.followers_count ?? 0) >= 1000) * 10) / 10,
    pct_followers_10k: Math.round(pct((u) => (u.followers_count ?? 0) >= 10000) * 10) / 10,
    verified_pct: Math.round(pct((u) => u.verified === true || Boolean(u.verified_type)) * 10) / 10,
    avg_friends: Math.round(avg((u) => u.friends_count)),
    avg_tweets: Math.round(avg((u) => u.statuses_count)),
    avg_age_days:
      users.length === 0
        ? 0
        : Math.round(
            users.reduce((s, u) => {
              if (!u.created_at) return s;
              const age = (Date.parse(now) - Date.parse(u.created_at)) / 86_400_000;
              return s + (Number.isFinite(age) && age > 0 ? age : 0);
            }, 0) / users.length
          ),
    top_handles: top,
  };
}

const now = new Date().toISOString();
const profiles = [];
const failed = [];
for (let i = 0; i < members.length; i++) {
  const m = members[i];
  process.stdout.write(`[${i + 1}/${members.length}] @${m.handle} … `);
  try {
    const { users } = await sampleFollowers(m.handle);
    const agg = aggregate(users, now);
    if (!agg) throw new Error("样本为空");
    profiles.push({ member_id: m.id, ...agg });
    process.stdout.write(`✓ ${agg.sample_size} 人\n`);
  } catch (e) {
    failed.push(`${m.handle}（${String(e).slice(0, 120)}）`);
    process.stdout.write(`✗\n`);
  }
}

if (APPLY && profiles.length) {
  const esc = (s) => String(s ?? "").replaceAll("'", "''");
  const rows = profiles.map((p) =>
    `INSERT OR REPLACE INTO fan_profiles (member_id, sampled_at, sample_size, avg_followers, pct_followers_1k, pct_followers_10k, verified_pct, avg_friends, avg_tweets, avg_age_days, top_handles) VALUES ('${esc(p.member_id)}', '${now}', ${p.sample_size}, ${p.avg_followers}, ${p.pct_followers_1k}, ${p.pct_followers_10k}, ${p.verified_pct}, ${p.avg_friends}, ${p.avg_tweets}, ${p.avg_age_days}, '${esc(JSON.stringify(p.top_handles))}');`
  );
  const sqlPath = "/tmp/fan-profiles.sql";
  writeFileSync(sqlPath, rows.join("\n"));
  execSync(`wrangler d1 execute kosx-impact --remote --file=${sqlPath}`, {
    stdio: "inherit",
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log("已灌入线上 fan_profiles");
}

console.log(`\n成功 ${profiles.length} 位，失败 ${failed.length} 位`);
if (failed.length) console.log("失败清单:\n" + failed.join("\n"));
console.log(`产物: /tmp/fan-profiles.json ${APPLY ? "（已入库）" : ""}`);
writeFileSync("/tmp/fan-profiles.json", JSON.stringify({ profiles, failed, sampled_at: now }, null, 2));