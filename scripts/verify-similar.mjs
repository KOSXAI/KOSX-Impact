// 相似账号候选验证：逐账号调 SocialData profile 确认真实存在，
// 返回存在性 + 展示信息供复核。候选是 agent 分析的产物，验证后人工筛掉不搭的再入库。
// 状态码分三档：200 = 存在；404 = 确认不存在/已注销；其他（429/5xx 等瞬时错误）
// 记为 error 而非「不存在」——限流抖动不该把账号误判成已注销。
// 用法：node scripts/verify-similar.mjs <candidates.json> [--out /tmp/similar-verified.json]
import { readFileSync, writeFileSync } from "node:fs";
import { readSocialDataKey, API_BASE } from "./_lib.mjs";

const argv = process.argv.slice(2);
const inPath = argv.find((a) => !a.startsWith("--"));
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 ? argv[outIdx + 1] : "/tmp/similar-verified.json";
if (!inPath) {
  console.error("用法：node scripts/verify-similar.mjs <candidates.json>");
  process.exit(1);
}

const apiKey = readSocialDataKey();
if (!apiKey) {
  console.error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
  process.exit(1);
}

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
  } else if (status === 404) {
    verified.set(handle, { exists: false, name: null, followers: null, bio: null });
    process.stdout.write(`✗ 不存在（HTTP 404）\n`);
  } else {
    // 429 / 5xx / 网络抖动：不定生死，人工重跑这一批
    verified.set(handle, { exists: null, error: `HTTP ${status}`, name: null, followers: null, bio: null });
    process.stdout.write(`⚠ 瞬时错误（HTTP ${status}），重跑确认\n`);
  }
}

writeFileSync(OUT, JSON.stringify({ similar: data.similar, verified: Object.fromEntries(verified) }, null, 2));
const missing = unique.filter((h) => verified.get(h).exists === false);
const errored = unique.filter((h) => verified.get(h).exists === null);
console.log(`\n验证完成：存在 ${unique.length - missing.length - errored.length}，不存在 ${missing.length} 个，瞬时错误 ${errored.length} 个`);
if (missing.length) console.log("不存在清单:", missing.join(", "));
if (errored.length) console.log("瞬时错误清单（重跑确认）:", errored.join(", "));
console.log(`产物: ${OUT}`);
