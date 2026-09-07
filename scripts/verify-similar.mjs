// 相似账号候选验证：逐账号调 SocialData profile 确认真实存在（404 = 不存在/已注销），
// 返回存在性 + 展示信息供复核。候选是 agent 分析的产物，验证后人工筛掉不搭的再入库。
// 用法：node scripts/verify-similar.mjs <candidates.json> [--out /tmp/similar-verified.json]
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const inPath = argv.find((a) => !a.startsWith("--"));
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 ? argv[outIdx + 1] : "/tmp/similar-verified.json";
if (!inPath) {
  console.error("用法：node scripts/verify-similar.mjs <candidates.json>");
  process.exit(1);
}

const devVars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf-8") : "";
const apiKey =
  process.env.SOCIALDATA_API_KEY ?? devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
  process.exit(1);
}

const API_BASE = "https://api.socialdata.tools";
const MIN_INTERVAL_MS = 650;

const data = JSON.parse(readFileSync(inPath, "utf-8"));
const all = data.similar.flatMap((m) => m.items.map((i) => i.handle));
const unique = [...new Set(all)];
console.log(`共 ${data.similar.length} 位成员，${unique.length} 个候选账号待验证`);

let lastRequestAt = 0;
async function get(path) {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

const verified = new Map();
for (let i = 0; i < unique.length; i++) {
  const handle = unique[i];
  process.stdout.write(`[${i + 1}/${unique.length}] @${handle} … `);
  const { status, body } = await get(`/twitter/user/${encodeURIComponent(handle)}`);
  if (status === 200 && body) {
    verified.set(handle, {
      exists: true,
      name: body.name ?? null,
      followers: body.followers_count ?? null,
      bio: body.description ?? null,
    });
    process.stdout.write(`✓ ${(body.name ?? "").slice(0, 16)} (${body.followers_count ?? "?"}粉)\n`);
  } else {
    verified.set(handle, { exists: false, name: null, followers: null, bio: null });
    process.stdout.write(`✗ 不存在（HTTP ${status}）\n`);
  }
}

writeFileSync(OUT, JSON.stringify({ similar: data.similar, verified: Object.fromEntries(verified) }, null, 2));
const missing = unique.filter((h) => !verified.get(h).exists);
console.log(`\n验证完成：存在 ${unique.length - missing.length}，不存在 ${missing.length} 个`);
if (missing.length) console.log("不存在清单:", missing.join(", "));
console.log(`产物: ${OUT}`);