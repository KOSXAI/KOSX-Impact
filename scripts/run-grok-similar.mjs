// 批量跑 Grok 相似账号推荐：对每个 handle 单独调用 grok headless（-p + --output-format json），
// 多进程并发。每个 handle 独立 prompt，Grok 用 x_search 访问该博主主页读 bio+帖子，
// 输出 {"similar":[{handle,name,reason,difference}]}，聚合写 /tmp/grok-similar.json。
// 用法：node scripts/run-grok-similar.mjs [--concurrency 8] [--apply] [handle...]
// --apply：产物直接生成 SQL 并经 wrangler d1 灌入线上库（similar_accounts 幂等覆盖）
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const PROMPT = `你是 KOSX 万粉影响力计划的「相似账号推荐官」。用 x_search 工具访问指定博主主页，读取他的 bio 和最近帖子，输出 3-5 个与他**实质相似**的 X 账号（严格 JSON）。

## 操作要求
- 用 x_search 工具访问该博主主页（参数 allowed_x_handles=["该handle"]，query 调取 bio 与最近帖子内容）。
- 至少精读 5 条帖子再下结论；帖子太少或几乎为空的，按 bio 判断并减少推荐数量。
- 相似的定义：内容主题、目标人群、内容风格、商业模式任一维度高度重合。必须真实存在、当前仍活跃。
- 不要推荐博主本人、不要推荐明显不相关的账号；推荐顺序按相似度从高到低。

## 输出（严格 JSON，不要输出其他文字）
{"similar": [{"handle": "HANDLE", "name": "显示名（可空）", "reason": "相似理由一句话", "difference": "主要差异一句话（可空）"}, ...]}

## 要推荐的博主
HANDLE`;

const argv = process.argv.slice(2);
const concurrencyIdx = argv.indexOf("--concurrency");
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(argv[concurrencyIdx + 1], 10) : 8;
const APPLY = argv.includes("--apply");
const wantHandles = argv.filter((a) => !a.startsWith("--"));

let handles = wantHandles;
if (handles.length === 0) {
  const out = execSync(
    `wrangler d1 execute kosx-impact --remote --json --command "SELECT m.id, m.handle FROM members m WHERE m.status='active' ORDER BY m.handle"`,
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );
  handles = JSON.parse(out).flatMap((r) => r.results ?? []);
}

// handles 可能带 id（无命令行参数时），统一为 [{id, handle}]
let members = handles;
if (typeof handles[0] === "string") {
  members = handles.map((h) => ({ id: null, handle: h }));
}
console.log(`待扫描 ${members.length} 位，并发 ${CONCURRENCY}${APPLY ? "，产物直接入库" : ""}`);

function scan({ handle }) {
  return new Promise((resolve) => {
    const prompt = PROMPT.replaceAll("HANDLE", handle);
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
      resolve({ handle, ok: code === 0, text, stderr: stderr.slice(0, 300) });
    });
    child.on("error", (e) => resolve({ handle, ok: false, text: "", stderr: String(e) }));
  });
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < members.length) {
    const idx = cursor++;
    const m = members[idx];
    process.stdout.write(`[${idx + 1}/${members.length}] @${m.handle} … `);
    const r = await scan(m);
    if (r.ok && r.text) {
      process.stdout.write(`✓\n`);
      results.push({ ...r, id: m.id });
    } else {
      process.stdout.write(`✗ ${r.stderr || "无输出"}\n`);
      results.push({ ...r, id: m.id });
    }
  }
}
const workers = Array.from({ length: CONCURRENCY }, () => worker());
await Promise.all(workers);

// 汇总：解析每条的 similar JSON，合并
const similar = [];
const failed = [];
for (const r of results) {
  try {
    const parsed = JSON.parse(r.text);
    const arr = Array.isArray(parsed.similar) ? parsed.similar : [];
    const valid = arr.filter((s) => s && s.handle && s.reason);
    if (valid.length) similar.push({ member_id: r.id, handle: r.handle, items: valid });
    else failed.push(`${r.handle}（返回空）`);
  } catch {
    failed.push(r.handle);
  }
}

const outPath = "/tmp/grok-similar.json";
writeFileSync(outPath, JSON.stringify({ similar }, null, 2));
console.log(`\n成功 ${similar.length} 位（共 ${similar.reduce((s, m) => s + m.items.length, 0)} 条推荐），失败 ${failed.length} 位`);
if (failed.length) console.log("失败清单:", failed.join(", "));
console.log(`产物: ${outPath}`);

if (APPLY && similar.length) {
  // member_id 缺失时按 handle 反查线上 members（命令行直传 handle 的场景）
  const missing = similar.filter((m) => !m.member_id).map((m) => m.handle);
  const idByHandle = new Map();
  if (missing.length) {
    const out = execSync(
      `wrangler d1 execute kosx-impact --remote --json --command "SELECT id, handle FROM members WHERE handle IN (${missing.map((h) => `'${h.replaceAll("'", "''")}'`).join(",")})"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    for (const r of JSON.parse(out).flatMap((r) => r.results ?? [])) idByHandle.set(r.handle, r.id);
  }
  const esc = (s) => (s ?? "").replaceAll("'", "''");
  const now = new Date().toISOString();
  const rows = [];
  let skipped = 0;
  for (const m of similar) {
    const memberId = m.member_id ?? idByHandle.get(m.handle);
    if (!memberId) {
      skipped++;
      continue;
    }
    for (const s of m.items) {
      rows.push(
        `INSERT OR REPLACE INTO similar_accounts (member_id, handle, name, avatar, reason, difference, created_at) VALUES ('${esc(memberId)}', '${esc(s.handle)}', '${esc(s.name ?? "")}', '', '${esc(s.reason)}', '${esc(s.difference ?? "")}', '${now}');`
      );
    }
  }
  const sqlPath = "/tmp/grok-similar.sql";
  writeFileSync(sqlPath, rows.join("\n"));
  execSync(`wrangler d1 execute kosx-impact --remote --file=${sqlPath}`, {
    stdio: "inherit",
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log(`已灌入线上 similar_accounts（幂等覆盖${skipped ? `，跳过 ${skipped} 位无 id` : ""}）`);
}