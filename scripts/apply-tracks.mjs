// 赛道/标签分类产物入库：读取人工/agent 判断的分类 JSON
// （格式 {members:[{handle,tracks[],tags[],confidence,note}]}），校验后写入线上库 members 表。
//
// 校验规则（与 src/tracks.ts 的 TRACK_NAMES 白名单一致，此处硬编码副本避免跨模块 import TS）：
// - tracks 必须 ∈ 白名单（AI工具/财经/开发者/增长/出海/综合），1-3 个，去重
// - tags 3-8 个，去重
// - 跑偏项（枚举外赛道 / 结构不合法）拒绝并列出，不写库
// - confidence < 0.7 的项照常写库，但输出低置信清单供人工复查
//
// 用法：node scripts/apply-tracks.mjs /path/to/output.json
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TRACK_WHITELIST = ["AI工具", "财经", "开发者", "增长", "出海", "综合"];
const TRACK_MAX = 3;
const TAGS_MIN = 3;
const TAGS_MAX = 8;
const LOW_CONFIDENCE = 0.7;

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("用法：node scripts/apply-tracks.mjs /path/to/output.json");
  process.exit(1);
}
const data = JSON.parse(readFileSync(inputPath, "utf8"));
const members = Array.isArray(data.members) ? data.members : [];
console.log(`读取 ${members.length} 位成员的分类结果`);

function runSql(sql) {
  return JSON.parse(
    execSync(`wrangler d1 execute kosx-impact --remote --json --command "${sql.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
    })
  );
}

const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;
let ok = 0;
const rejected = [];
const lowConf = [];
const notFound = [];

for (const m of members) {
  const { handle, tracks, tags, confidence } = m;
  // 结构校验：tracks/tags 必须是数组；显式空数组 = 清空分类（摘除赛道），缺字段 = 拒绝
  const problems = [];
  if (!Array.isArray(tracks)) problems.push("tracks 缺失或非数组");
  if (!Array.isArray(tags)) problems.push("tags 缺失或非数组");
  if (problems.length > 0) {
    rejected.push(`@${handle}: ${problems.join("、")}`);
    continue;
  }
  const clear = tracks.length === 0 && tags.length === 0;
  if (!clear) {
    // 赛道白名单校验 + 去重
    const dedupTracks = [...new Set(tracks)];
    const badTracks = dedupTracks.filter((t) => !TRACK_WHITELIST.includes(t));
    if (badTracks.length > 0) {
      rejected.push(`@${handle}: 赛道不在白名单（${badTracks.join("、")}）`);
      continue;
    }
    if (dedupTracks.length > TRACK_MAX) {
      rejected.push(`@${handle}: 赛道超 ${TRACK_MAX} 个（${dedupTracks.join("、")}）`);
      continue;
    }
    const dedupTags = [...new Set(tags)];
    if (dedupTags.length < TAGS_MIN || dedupTags.length > TAGS_MAX) {
      rejected.push(`@${handle}: 标签数 ${dedupTags.length}（需 ${TAGS_MIN}-${TAGS_MAX}）`);
      continue;
    }
  }

  // 写库：按 handle 匹配（members.handle 唯一），同时 bump cache_bust。
  // clear（显式空数组）= 清空分类；否则写去重后的值
  const finalTracks = clear ? [] : [...new Set(tracks)];
  const finalTags = clear ? [] : [...new Set(tags)];
  const res = runSql(
    `UPDATE members SET tracks = ${sql(JSON.stringify(finalTracks))}, tags = ${sql(
      JSON.stringify(finalTags)
    )}, updated_at = datetime('now') WHERE handle = ${sql(handle)} AND status = 'active'`
  );
  const changed = res?.[0]?.meta?.changes ?? 0;
  if (changed === 0) {
    notFound.push(`@${handle}`);
    continue;
  }
  ok++;
  if (typeof confidence === "number" && confidence < LOW_CONFIDENCE) {
    lowConf.push(`@${handle} (${confidence})`);
  }
  console.log(`✓ @${handle} -> ${finalTracks.length ? finalTracks.join("/") : "(清空)"} · ${finalTags.length} 标签${confidence != null ? ` · conf=${confidence}` : ""}`);
}

// 有写入成功才 bump cache_bust（读端点缓存键换新，各数据中心立即可见）
if (ok > 0) {
  runSql(
    `INSERT INTO site_meta (key, value) VALUES ('cache_bust', '1')
     ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`
  );
  console.log(`\n已写库 ${ok} 位，cache_bust +1`);
}

if (rejected.length) {
  console.log(`\n✗ 拒绝 ${rejected.length} 条（不写库，需修正后重跑）：`);
  for (const r of rejected) console.log("  " + r);
}
if (notFound.length) {
  console.log(`\n? 未匹配到活跃成员 ${notFound.length} 条（handle 拼写或状态检查）：`);
  for (const n of notFound) console.log("  " + n);
}
if (lowConf.length) {
  console.log(`\n⚠ 低置信度 ${lowConf.length} 条（已写库，建议人工复查）：`);
  for (const l of lowConf) console.log("  " + l);
}
console.log(`\n完成：写库 ${ok}，拒绝 ${rejected.length}，未匹配 ${notFound.length}，低置信 ${lowConf.length}`);
