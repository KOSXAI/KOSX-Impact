// 彻底清理成员（级联删除所有关联表 + 加入 excluded_handles 防止再次自助注册 + 刷新缓存版本）。
//
// 适用场景：误收录站外大V（如 elonmusk）或需要物理抹除历史数据的成员。
// 若只需暂停展示并保留历史快照，优先使用 scripts/set-member-status.mjs <id> removed。
//
// 默认干跑（只打印统计行数与 SQL）；加 --apply 才真正写库；加 --no-exclude 可不写入排除名单。
//
// 用法：
//   env -u CLOUDFLARE_API_TOKEN node scripts/purge-member.mjs <成员id或handle> [--apply] [--no-exclude]
import { BUMP_CACHE_BUST_SQL, d1Execute, d1Query, lit } from "./_lib.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const noExclude = args.includes("--no-exclude");
const rawTarget = args.find((a) => !a.startsWith("--"));

if (!rawTarget) {
  console.error("用法：node scripts/purge-member.mjs <成员id或handle> [--apply] [--no-exclude]");
  process.exit(1);
}

const needle = rawTarget.trim().replace(/^@+/, "").toLowerCase();
const target = d1Query(
  `SELECT id, handle, display_name, status, self_registered
   FROM members
   WHERE lower(id) = ${lit(needle)} OR lower(handle) = ${lit(needle)}
   LIMIT 1`,
)[0];

if (!target) {
  console.error(`线上 members 表未找到匹配成员：${rawTarget}`);
  process.exit(1);
}

const idLit = lit(target.id);
const handleLit = lit(target.handle.toLowerCase());

const tables = [
  ["posts", `member_id = ${idLit}`],
  ["milestones", `member_id = ${idLit}`],
  ["snapshots", `member_id = ${idLit}`],
  ["refresh_queue", `member_id = ${idLit}`],
  ["member_mentions", `member_id = ${idLit}`],
  ["fan_profiles", `member_id = ${idLit}`],
  ["similar_accounts", `member_id = ${idLit}`],
  ["invite_events", `inviter_id = ${idLit} OR invited_member_id = ${idLit}`],
  ["members", `id = ${idLit}`],
];

console.log(
  `目标成员：${target.id}（@${target.handle} / ${target.display_name ?? "无昵称"}，status=${target.status}，self_registered=${target.self_registered}）`,
);
console.log("各表将删除行数：");
for (const [tbl, where] of tables) {
  const cnt = d1Query(`SELECT COUNT(*) AS n FROM ${tbl} WHERE ${where}`)[0]?.n ?? 0;
  console.log(`  - ${tbl.padEnd(18)} ${cnt} 行`);
}

const stmts = tables.map(([tbl, where]) => `DELETE FROM ${tbl} WHERE ${where};`);
if (!noExclude) {
  stmts.push(`INSERT OR IGNORE INTO excluded_handles (handle) VALUES (${handleLit});`);
}
stmts.push(BUMP_CACHE_BUST_SQL);

console.log(apply ? "\n正在执行清理：" : "\n（干跑，未执行）将要执行：");
for (const s of stmts) console.log(`  ${s}`);

if (!apply) {
  console.log("\n确认无误后加 --apply 执行写库。");
  process.exit(0);
}

for (const s of stmts) {
  d1Execute(s);
}
console.log(
  `\n✅ 已彻底清理 ${target.id}（@${target.handle}）${noExclude ? "" : "并登记到 excluded_handles"}，cache_bust +1`,
);
