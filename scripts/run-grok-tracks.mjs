// 批量跑 Grok 赛道分类：对每个 handle 单独调用 grok headless（-p + --output-format json），
// 多进程并发。每个 handle 独立 prompt，Grok 用 x_search 访问该博主主页读 bio+帖子，
// 输出 {members:[{handle,tracks[],tags[],confidence,note}]}。
// 产物聚合写 /tmp/grok-tracks.json，供 apply-tracks.mjs 入库。
// 用法：node scripts/run-grok-tracks.mjs [--concurrency 8] [handle...]
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

// —— 从 docs/grok-track-classifier.md 提取分类指令（赛道定义/信号词/置信度规则）——
// 这里内联一份完整指令，与 docs 模板一致
const PROMPT = `你是 KOSX 万粉影响力计划的赛道分类官。用 x_search 工具访问指定博主主页，读取 bio 和最近帖子，判断他的【赛道】和【标签】，输出严格 JSON。

## 操作要求
- 对下面这个 handle，用 x_search 工具访问该博主主页（参数 allowed_x_handles=["该handle"]，query 调取 bio 与最近帖子内容）。
- 判断依据：帖子内容权重为第一信号（看"他实际在发什么"），bio 为佐证。若 bio 与帖子冲突，以帖子为准。
- 至少精读 5 条帖子再下结论；帖子太少或几乎为空的，按 bio 判断并降低置信度。

## 赛道体系（一人可挂 1-3 个，按内容主线排序）
1. AI工具：不写代码，靠 AI 工具落地/培训/服务/分享。信号：AI 工具分享与实测、Codex 实战、AI 工作流/提示词、AI 培训或课程、本地模型/知识库、AI 变现、AI 应用教程。
2. 财经：美股/加密/交易/宏观。信号：美股、期权、SPX、web3、crypto、链上、交易系统、宏观/利率、投资研究、复利。
3. 开发者：写代码/造产品/SaaS/Indie Hacker。信号：编程、full-stack、开源项目、SaaS、Indie Hacker、Build in Public、上线产品、技术架构、Engineer/PhD in CS。
4. 增长：自媒体/做号/营销/运营。信号：自媒体、涨粉、流量、账号运营、创作者、营销、内容增长、社群运营。
5. 出海：跨境/华语 X 出海。信号：跨境电商（亚马逊/Temu/Shein）、出海工具、海外市场、华语创作者做海外内容。
6. 综合：无法明确归入以上任何赛道，或信号过弱/过于混杂时归此赛道。综合是过渡桶，不要轻易使用——只有确实定不了才归综合。

## 标签（tags）要求
- 3-8 个，自由发挥，描述该博主的领域细节、身份、风格、人群。
- 例子：Agent、出海、00后、学生、前大厂、Building in Public、理财、医疗健康、跨境电商、美股、web3、设计、教育、副业、长期主义。

## 置信度（confidence）
- 0-1 浮点数，代表你对这条分类判断的把握。帖子充分且信号清晰 ≥ 0.85；帖子少或信号模糊 0.6-0.8；非常模糊 < 0.6。归「综合」的置信度 ≤ 0.65。

## 输出（严格 JSON，不要输出其他文字）
{"members": [{"handle": "HANDLE", "tracks": ["财经", "出海"], "tags": ["美股", "web3", "00后", "长期主义"], "confidence": 0.9, "note": "一句话判断依据"}]}

## 要分类的博主
HANDLE`;

// 默认并发数：套餐额度充足，跑满本机能力
const argv = process.argv.slice(2);
const concurrencyIdx = argv.indexOf("--concurrency");
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(argv[concurrencyIdx + 1], 10) : 8;
const wantHandles = argv.filter((a) => !a.startsWith("--"));

// handle 来源：命令行指定，否则线上库 active 成员
let handles = wantHandles;
if (handles.length === 0) {
  // 从 wrangler 导出线上 active 成员
  const { execSync } = await import("node:child_process");
  const out = execSync(
    `wrangler d1 execute kosx-impact --remote --json --command "SELECT handle FROM members WHERE status='active' ORDER BY handle"`,
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  );
  handles = JSON.parse(out)
    .flatMap((r) => r.results ?? [])
    .map((r) => r.handle);
}

console.log(`待分类 ${handles.length} 位，并发 ${CONCURRENCY}，逐位独立调用 grok headless`);

function classify(handle) {
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
      // 从 json 输出里提取 text 字段（grok 的 --output-format json 是包裹对象）
      let text = "";
      try {
        const parsed = JSON.parse(stdout);
        text = parsed.text ?? "";
        // text 可能是 JSON 字符串，也可能是 markdown 包裹的 JSON
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

// 并发调度：固定 worker 池
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < handles.length) {
    const idx = cursor++;
    const handle = handles[idx];
    process.stdout.write(`[${idx + 1}/${handles.length}] @${handle} … `);
    const r = await classify(handle);
    if (r.ok && r.text) {
      process.stdout.write(`✓\n`);
      results.push(r);
    } else {
      process.stdout.write(`✗ ${r.stderr || "无输出"}\n`);
      results.push(r);
    }
  }
}
const workers = Array.from({ length: CONCURRENCY }, () => worker());
await Promise.all(workers);

// 汇总：解析每条的 members JSON，合并成一个 {members:[...]}
const members = [];
const failed = [];
for (const r of results) {
  try {
    const parsed = JSON.parse(r.text);
    const arr = Array.isArray(parsed.members) ? parsed.members : [parsed];
    for (const m of arr) {
      if (m && m.handle) members.push(m);
    }
  } catch {
    failed.push(r.handle);
  }
}

const outPath = "/tmp/grok-tracks.json";
writeFileSync(outPath, JSON.stringify({ members }, null, 2));
console.log(`\n成功 ${members.length} 位，失败/解析失败 ${failed.length} 位`);
if (failed.length) console.log("失败清单:", failed.join(", "));
console.log(`产物: ${outPath} —— 执行 node scripts/apply-tracks.mjs ${outPath} 入库`);
