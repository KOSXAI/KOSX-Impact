// KOSX 声量监控（SocialData Search 版）：按关键词搜索 X 上的提及，输出原始 JSON，
// 供 agent 分析（相关性去噪 + 情绪判定）后生成 SQL 入库。数据全部来自 SocialData
// （$0.0002/条搜索结果），判断由 agent 模型完成。
// 增量抓取：site_meta.last_mention_since 记录上次游标，只拉新增（上限 7 天窗口兜底）。
// --advance：拉取完成后自动把本次运行时刻写入游标（增量模式专用；分析入库与拉取同批
// 完成时用，避免下次重复拉同一窗口）。
// 用法：node scripts/run-mentions.mjs [keyword...] [--days 7] [--advance] [--out /tmp/mentions-raw.json]
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const take = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : def;
};
const DAYS = parseInt(take("--days", "7"), 10);
const OUT = take("--out", "/tmp/mentions-raw.json");
const ADVANCE = argv.includes("--advance");
const FLAGS = new Set(["--days", "--out", "--advance"]);
const KEYWORDS = ["KOSX", "impact.kosx.ai", "万粉影响力计划"];
const wantKeywords = argv.filter((a, i) => !a.startsWith("--") && !FLAGS.has(argv[i - 1]));
const keywords = wantKeywords.length ? wantKeywords : KEYWORDS;
const META_KEY = "last_mention_since";

const devVars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf-8") : "";
const apiKey =
  process.env.SOCIALDATA_API_KEY ?? devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
  process.exit(1);
}

// 增量游标：site_meta.last_mention_since（epoch 秒，由 agent 入库成功后推进）；
// 无游标 / 异常旧游标回退窗口上限
const readMeta = (key) => {
  const out = execSync(
    `wrangler d1 execute kosx-impact --remote --json --command "SELECT value FROM site_meta WHERE key = '${key}'"`,
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );
  const rows = JSON.parse(out).flatMap((r) => r.results ?? []);
  const v = rows[0]?.value;
  return v && /^\d+$/.test(v) ? parseInt(v, 10) : null;
};

const MAX_WINDOW = Math.floor((Date.now() - DAYS * 86_400_000) / 1000);
const prevSince = readMeta(META_KEY);
const since = prevSince != null ? Math.max(prevSince, MAX_WINDOW) : MAX_WINDOW;
const collectedAt = new Date().toISOString();
console.log(
  `搜索 ${keywords.length} 个关键词${prevSince != null ? `，增量起点 ${new Date(since * 1000).toISOString()}` : `，首次运行回退 ${DAYS} 天窗口`}`
);

const API_BASE = "https://api.socialdata.tools";
const MIN_INTERVAL_MS = 650;

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

const out = [];
const failed = [];

for (let i = 0; i < keywords.length; i++) {
  const keyword = keywords[i];
  process.stdout.write(`[${i + 1}/${keywords.length}] 关键词「${keyword}」… `);
  try {
    // 精确短语 + 增量起点（since_time）+ 排除回复（提及噪音多来自互动回复，先取正文提及）
    const query = encodeURIComponent(`"${keyword}" since_time:${since} -filter:replies`);
    const page = await get(`/twitter/search?query=${query}&type=Latest`);
    const tweets = (page.tweets ?? []).map((t) => ({
      tweet_id: t.id_str ?? null,
      handle: t.user?.screen_name ?? null,
      name: t.user?.name ?? null,
      text: t.full_text ?? null,
      created_at: t.tweet_created_at ?? null,
      views: t.views_count ?? null,
      likes: t.favorite_count ?? null,
      url: t.id_str ? `https://x.com/${encodeURIComponent(t.user?.screen_name ?? "i")}/status/${t.id_str}` : null,
    }))
      .filter((t) => t.tweet_id && t.text);
    out.push({ keyword, tweets });
    process.stdout.write(`✓ ${tweets.length} 条\n`);
  } catch (e) {
    failed.push(`${keyword}（${String(e).slice(0, 120)}）`);
    process.stdout.write(`✗\n`);
  }
}

// 产物元数据：agent 入库成功后应把 collected_at（epoch 秒）写入 site_meta.last_mention_since 推进游标
writeFileSync(
  OUT,
  JSON.stringify({ meta: { since, collected_at: collectedAt, since_key: META_KEY }, keywords: out }, null, 2)
);
const total = out.reduce((s, g) => s + g.tweets.length, 0);
console.log(`\n共 ${total} 条增量提及，失败 ${failed.length} 个关键词；产物: ${OUT}`);
if (failed.length) console.log("失败清单:\n" + failed.join("\n"));

// --advance：本次窗口已完整分析入库，推进游标（增量语义：下次只拉新提及）
if (ADVANCE && failed.length === 0) {
  const cursor = Math.floor(Date.parse(collectedAt) / 1000).toString();
  execSync(
    `wrangler d1 execute kosx-impact --remote --command "INSERT INTO site_meta (key, value) VALUES ('${META_KEY}', '${cursor}') ON CONFLICT(key) DO UPDATE SET value = excluded.value"`,
    { stdio: "inherit", maxBuffer: 10 * 1024 * 1024 }
  );
  console.log(`已推进增量游标 → ${new Date(parseInt(cursor) * 1000).toISOString()}`);
} else if (ADVANCE && failed.length > 0) {
  console.log("有失败关键词，游标未推进（下次运行会重试完整窗口）");
}