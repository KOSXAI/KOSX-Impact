/**
 * 生成 OG 分享卡的中文子集字体 → public/fonts/og-noto-sc-{400,700}.ttf
 *
 * 字源：Noto Sans SC（SIL OFL 1.0）官方 SubsetOTF/SC。
 * 字符集分两档（og-render.ts 的渲染约定：动态文本一律 700 粗体，400 仅用于固定文案与 @handle）：
 * - 700：ASCII + 常用标点 + makemeahanzi 全字表（约 9500 字，覆盖《通用规范汉字表》）
 *        + 仓库文案与成员昵称出现过的所有非 ASCII 字符——昵称是唯一不可预知的文本，
 *        这是「生僻字变豆腐块」的折中防线；
 * - 400：ASCII + 常用标点 + 仓库文案（X 的 handle 必为 ASCII，固定文案全部在仓库里）。
 *
 * 需要联网（下载字源与字表）。改了卡面文案 / 新增段位名之后必须重跑：
 *   npm run build:og-fonts
 * 产物需要提交进仓库（构建与部署不联网跑本脚本）。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const FONT_BASE =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC";
const SOURCES = [
  { weight: 400, file: "NotoSansSC-Regular.otf", out: "og-noto-sc-400.ttf", wide: false },
  { weight: 700, file: "NotoSansSC-Bold.otf", out: "og-noto-sc-700.ttf", wide: true },
];
const MAKEMEAHANZI =
  "https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "fonts");

/** 仓库内实际用到的字符：卡面/站点文案 + 段位名 + 现有成员昵称（兜底） */
async function repoChars() {
  const files = [
    "src/og.ts",
    "src/card.ts",
    "src/milestones.ts",
    "src/lib/format.ts",
    "src/lib/site.ts",
    "src/routes/index.tsx",
    "src/routes/about.tsx",
    "src/routes/members.$id.tsx",
    "data/members.json",
  ];
  const chars = new Set();
  for (const f of files) {
    try {
      const text = await readFile(path.join(ROOT, f), "utf8");
      for (const ch of text) if (ch.codePointAt(0) > 0x7f) chars.add(ch);
    } catch {
      // 单个文件缺失不阻塞（首跑时其余文件已足够覆盖固定文案）
    }
  }
  return chars;
}

/** makemeahanzi 字典全字表（dictionary.txt 每行一个 JSON，取 character 字段） */
async function hanziChars() {
  const res = await fetch(MAKEMEAHANZI);
  if (!res.ok) throw new Error(`makemeahanzi 字典下载失败：${res.status}`);
  const text = await res.text();
  const chars = new Set();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const ch = JSON.parse(line).character;
    if (typeof ch === "string") chars.add(ch);
  }
  return chars;
}

const PRINTABLE = [...Array(0x7e - 0x20 + 1)].map((_, i) => String.fromCharCode(0x20 + i));
const PUNCT = "·…—―→←↑↓•「」『』【】（）《》〈〉“”‘’！？：；、。，％＋＠＃￥";
const HEAD_COMMENT = "本文件由 scripts/build-og-fonts.mjs 生成，勿手改；重新生成：npm run build:og-fonts";

async function main() {
  const [repo, hanzi] = await Promise.all([repoChars(), hanziChars()]);
  console.log(`仓库字符 ${repo.size}，makemeahanzi 字表 ${hanzi.size}`);

  const shared = new Set([...PRINTABLE, ...PUNCT, ...repo]);
  const wide = new Set([...shared, ...hanzi]);
  console.log(`子集字符集：400 档 ${shared.size}，700 档 ${wide.size}`);

  await mkdir(OUT_DIR, { recursive: true });
  for (const src of SOURCES) {
    const res = await fetch(`${FONT_BASE}/${src.file}`);
    if (!res.ok) throw new Error(`字源下载失败 ${src.file}：${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    const subset = await subsetFont(original, [...(src.wide ? wide : shared)].join(""), {
      targetFormat: "truetype",
    });
    const out = path.join(OUT_DIR, src.out);
    await writeFile(out, subset);
    console.log(`${src.out}：${(original.length / 1e6).toFixed(1)}MB → ${(subset.length / 1e6).toFixed(2)}MB`);
  }
  console.log(`完成。注意：${HEAD_COMMENT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
