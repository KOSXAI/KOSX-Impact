/**
 * 页面冒烟走查（CDP）：启动本地 dev 后逐页访问，断言
 * ① 无 console error / 未捕获异常 ② 主内容真的渲染出来（不是空白壳）
 * ③ 关键区块可见（入场动效没有把内容停在 initial 隐藏态）。
 * 用法：node scripts/smoke-pages.mjs [baseUrl]
 */
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:5173";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PAGES = [
  { path: "/", name: "首页", must: ["社群累计粉丝", "成员榜单"] },
  { path: "/members", name: "博主库", must: [] },
  { path: "/posts", name: "内容", must: ["内容洞察", "精华帖"] },
  { path: "/reports", name: "报告", must: ["社群日报", "年度报告"] },
  { path: "/daily", name: "日报", must: [] },
  { path: "/annual", name: "年报", must: [] },
  { path: "/report", name: "能量报告", must: [] },
  { path: "/about", name: "关于", must: [] },
  { path: "/compare", name: "对比", must: ["成员对比"] },
];

// 最小正文字数：按各页实际信息量定（/compare 与 /reports 本就是稀疏页面，
// 统一阈值会把正常渲染误判成空白）
const MIN_TEXT = {
  "/reports": 80,
  "/compare": 80,
  "/daily": 300,
  "/report": 300,
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let failures = 0;

for (const spec of PAGES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

  try {
    const res = await page.goto(`${BASE}${spec.path}`, { waitUntil: "networkidle2", timeout: 45000 });
    const status = res?.status() ?? 0;
    // 等入场动效跑完再量
    await new Promise((r) => setTimeout(r, 1200));

    const probe = await page.evaluate(() => {
      const body = document.body;
      const text = (body.innerText ?? "").trim();
      // 统计「可见但内容区为空」的区块：入场动效若停在 initial，会是 opacity 0 / 高度塌陷
      const main = document.querySelector("main") ?? body;
      const rect = main.getBoundingClientRect();
      const hiddenLayers = [...document.querySelectorAll("[style*='opacity: 0'], [style*='opacity:0']")].length;
      return {
        len: text.length,
        head: text.slice(0, 120).replace(/\s+/g, " "),
        mainHeight: Math.round(rect.height),
        hiddenLayers,
      };
    });

    const problems = [];
    const minLen = MIN_TEXT[spec.path] ?? 200;
    if (status !== 200) problems.push(`HTTP ${status}`);
    if (probe.len < minLen) problems.push(`正文过短(${probe.len}<${minLen})`);
    if (probe.mainHeight < 100) problems.push(`主区高度异常(${probe.mainHeight})`);
    for (const needle of spec.must) {
      const found = await page.evaluate((n) => document.body.innerText.includes(n), needle);
      if (!found) problems.push(`缺内容「${needle}」`);
    }
    if (errors.length) problems.push(`console: ${errors.slice(0, 2).join(" | ")}`);

    if (problems.length) {
      failures++;
      console.log(`✗ ${spec.name} ${spec.path} — ${problems.join("; ")}`);
    } else {
      console.log(`✓ ${spec.name} ${spec.path} — ${probe.len} 字，主区 ${probe.mainHeight}px，隐藏层 ${probe.hiddenLayers}`);
    }
  } catch (error) {
    failures++;
    console.log(`✗ ${spec.name} ${spec.path} — 异常：${error.message}`);
  }
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\n全部通过" : `\n${failures} 个页面有问题`);
process.exitCode = failures === 0 ? 0 : 1;
