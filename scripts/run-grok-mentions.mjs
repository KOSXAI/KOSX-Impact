// KOSX 声量监控：Grok 本机搜索 X 上对 KOSX 品牌的提及（关键词逐组独立调用 grok headless）。
// 产物聚合写 /tmp/grok-mentions.json；--apply 时直接生成 SQL 并经 wrangler d1 灌入线上
// mentions 表（(keyword, tweet_url) 唯一索引 + INSERT OR IGNORE 幂等去重）。
// 用法：node scripts/run-grok-mentions.mjs [--apply] [keyword...]
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const KEYWORDS = ["KOSX", "impact.kosx.ai", "万粉影响力计划"];

const PROMPT = `你是 KOSX 万粉影响力计划的「品牌声量监测员」。用 x_search 工具在 X 上搜索**最近 7 天**包含关键词「KEYWORD」的帖子（query 参数直接传该关键词，可配合操作符缩小范围），找出与本品牌「KOSX 万粉影响力计划 / impact.kosx.ai」相关的公开提及，输出严格 JSON。

## 操作要求
- 重点关注：提到 KOSX 计划、impact.kosx.ai 网站、万粉影响力、加 KOSX 社群/榜的帖子。
- 过滤：纯广告机器人、与 KOSX 无关的同名噪音（如其他领域的 KOSX）尽量不收录；拿不准的收录并标 neutral。
- 每条提及给出：作者 handle、显示名（可空）、内容摘要（保留原文字，≤100 字）、原文链接（可空）、情绪（positive/neutral/negative 三选一）。
- 没有相关提及时输出空数组，不要编造。

## 输出（严格 JSON，不要输出其他文字）
{"mentions": [{"handle": "HANDLE", "name": "显示名（可空）", "text": "内容摘要", "url": "原文链接（可空）", "sentiment": "positive|neutral|negative"}, ...]}

## 要搜索的关键词
KEYWORD`;

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const wantKeywords = argv.filter((a) => !a.startsWith("--"));
const keywords = wantKeywords.length ? wantKeywords : KEYWORDS;

console.log(`搜索 ${keywords.length} 个关键词：${keywords.join(" / ")}${APPLY ? "，产物直接入库" : ""}`);

function search(keyword) {
  return new Promise((resolve) => {
    const prompt = PROMPT.replaceAll("KEYWORD", keyword);
    const child = spawn("grok", ["-p", prompt, "--output-format", "json"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      let text = "";
      try {
        const parsed = JSON.parse(stdout);
        text = parsed.text ?? "";
        const m = text.match(/\{[\s\S]*\}/);
        if (m) text = m[0];
      } catch {
        const m = stdout.match(/\{[\s\S]*\}/);
        if (m) text = m[0];
      }
      resolve({ keyword, ok: code === 0, text, stderr: stderr.slice(0, 300) });
    });
    child.on("error", (e) => resolve({ keyword, ok: false, text: "", stderr: String(e) }));
  });
}

const results = await Promise.all(keywords.map(search));

// 汇总：每关键词解析 mentions，合并打 keyword 标记
const mentions = [];
const failed = [];
for (const r of results) {
  if (!r.ok) {
    failed.push(r.keyword);
    continue;
  }
  try {
    const parsed = JSON.parse(r.text);
    const arr = Array.isArray(parsed.mentions) ? parsed.mentions : [];
    for (const m of arr) {
      if (m && m.handle && m.text) mentions.push({ ...m, keyword: r.keyword });
    }
  } catch {
    failed.push(r.keyword);
  }
}

const outPath = "/tmp/grok-mentions.json";
writeFileSync(outPath, JSON.stringify({ mentions }, null, 2));
console.log(`\n收录提及 ${mentions.length} 条，失败关键词 ${failed.length} 个`);
if (failed.length) console.log("失败清单:", failed.join(", "));
console.log(`产物: ${outPath}`);

if (APPLY && mentions.length) {
  const esc = (s) => (s ?? "").replaceAll("'", "''");
  const now = new Date().toISOString();
  const rows = mentions.map((m) =>
    `INSERT OR IGNORE INTO mentions (keyword, author_handle, author_name, text, tweet_url, sentiment, collected_at) VALUES ('${esc(m.keyword)}', '${esc(m.handle)}', '${esc(m.name ?? "")}', '${esc(m.text)}', '${esc(m.url ?? "")}', '${esc(m.sentiment ?? "neutral")}', '${now}');`
  );
  const sqlPath = "/tmp/grok-mentions.sql";
  writeFileSync(sqlPath, rows.join("\n"));
  execSync(`wrangler d1 execute kosx-impact --remote --file=${sqlPath}`, {
    stdio: "inherit",
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log("已灌入线上 mentions（幂等去重）");
}