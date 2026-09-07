// KOSX 声量监控（SocialData Search 版）：按关键词搜索 X 上最近 N 天的提及，输出原始 JSON，
// 供 agent 分析（相关性去噪 + 情绪判定）后生成 SQL 入库。不再调用 Grok——
// 判断由 agent 模型完成，数据全部来自 SocialData（$0.0002/条搜索结果）。
// 用法：node scripts/run-mentions.mjs [keyword...] [--days 7] [--out /tmp/mentions-raw.json]
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const take = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : def;
};
const DAYS = parseInt(take("--days", "7"), 10);
const OUT = take("--out", "/tmp/mentions-raw.json");
const FLAGS = new Set(["--days", "--out"]);
const KEYWORDS = ["KOSX", "impact.kosx.ai", "万粉影响力计划"];
const wantKeywords = argv.filter((a, i) => !a.startsWith("--") && !FLAGS.has(argv[i - 1]));
const keywords = wantKeywords.length ? wantKeywords : KEYWORDS;

const devVars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf-8") : "";
const apiKey =
  process.env.SOCIALDATA_API_KEY ?? devVars.match(/^SOCIALDATA_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) {
  console.error("缺少 SOCIALDATA_API_KEY（.dev.vars 或环境变量）");
  process.exit(1);
}

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

const since = Math.floor((Date.now() - DAYS * 86_400_000) / 1000);
const out = [];
const failed = [];

for (let i = 0; i < keywords.length; i++) {
  const keyword = keywords[i];
  process.stdout.write(`[${i + 1}/${keywords.length}] 关键词「${keyword}」… `);
  try {
    // 精确短语 + 近 N 天 + 排除回复（提及噪音多来自互动回复，先取正文提及）
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
    out.push({ keyword, collected_at: new Date().toISOString(), tweets });
    process.stdout.write(`✓ ${tweets.length} 条\n`);
  } catch (e) {
    failed.push(`${keyword}（${String(e).slice(0, 120)}）`);
    process.stdout.write(`✗\n`);
  }
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
const total = out.reduce((s, o) => s + o.tweets.length, 0);
console.log(`\n共 ${total} 条原始提及，失败 ${failed.length} 个关键词；产物: ${OUT}`);
console.log("下一步：agent 分析产物（去噪 + 情绪）→ 生成 SQL 灌入 mentions 表（幂等 INSERT OR IGNORE）");
if (failed.length) console.log("失败清单:\n" + failed.join("\n"));