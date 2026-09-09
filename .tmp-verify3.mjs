// 第二轮精耕终验
import puppeteer from "puppeteer-core";

const BASE = "https://impact.kosx.ai";
let fail = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) fail++;
};
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. 首页移动端溢出已修
await page.setViewport({ width: 375, height: 812 });
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
await wait(7000);
let info = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, text: document.body.innerText }));
ok(info.sw <= info.iw + 1, "首页移动端无横向溢出", `sw=${info.sw} iw=${info.iw}`);
ok(info.text.includes("枚"), "今日动态分组出现「枚」计数");
await page.screenshot({ path: "/tmp/route-check/v3-home-mobile.png" });

// 2. 日报登阶分组
await page.setViewport({ width: 1280, height: 1600 });
await page.goto(BASE + "/daily", { waitUntil: "networkidle2", timeout: 60000 });
await wait(7000);
info = await page.evaluate(() => document.body.innerText);
const fufuCount = (info.match(/FUFU/g) || []).length;
const noyaCount = (info.match(/诺鸭船长3/g) || []).length;
ok(fufuCount <= 2 && noyaCount <= 2, "日报今日登阶按成员分组", `FUFU×${fufuCount} 诺鸭×${noyaCount}（改版前 3/6+）`);
ok(info.includes("枚"), "日报出现「枚」计数");
await page.screenshot({ path: "/tmp/route-check/v3-daily.png" });

// 3. 年报登阶分组 + 最火内容无裸链
await page.goto(BASE + "/annual", { waitUntil: "networkidle2", timeout: 60000 });
await wait(7000);
info = await page.evaluate(() => ({ t: document.body.innerText, html: document.body.innerHTML }));
const noyaAnnual = (info.t.match(/诺鸭船长3/g) || []).length;
ok(noyaAnnual <= 2, "年报年度登阶按成员分组", `诺鸭×${noyaAnnual}（改版前 6+）`);
ok(!/\nhttps?:\/\/t\.co\//.test(info.t), "年报最火内容无裸短链");
await page.screenshot({ path: "/tmp/route-check/v3-annual.png" });

// 4. 内容页爆款卡无裸短链
await page.goto(BASE + "/posts", { waitUntil: "networkidle2", timeout: 60000 });
await wait(7000);
info = await page.evaluate(() => document.body.innerText);
ok(!/https:\/\/t\.co\/[A-Za-z0-9]+/.test(info), "内容页全文无裸 t.co 短链");
await page.screenshot({ path: "/tmp/route-check/v3-posts.png" });

// 5. 榜单两个未见过的子榜
await page.goto(BASE + "/leaderboard?tab=growth", { waitUntil: "networkidle2", timeout: 60000 });
await wait(6000);
await page.screenshot({ path: "/tmp/route-check/v3-lb-growth.png" });
await page.goto(BASE + "/leaderboard?tab=climbs", { waitUntil: "networkidle2", timeout: 60000 });
await wait(6000);
info = await page.evaluate(() => ({ t: document.body.innerText, headers: document.querySelectorAll("header").length }));
ok(info.headers === 1, "登阶记录子榜 header×1", String(info.headers));
await page.screenshot({ path: "/tmp/route-check/v3-lb-climbs.png" });

// 6. 全站状态码回归
for (const u of ["/", "/members", "/tracks", "/posts", "/report", "/daily", "/annual", "/compare", "/about"]) {
  const code = await page.evaluate((u) => fetch(u, { method: "HEAD" }).then((r) => r.status), BASE + u).catch(() => 0);
  ok(code === 200, `HEAD ${u}`, String(code));
}

await browser.close();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
