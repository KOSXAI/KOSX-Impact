// 成员状态维护：把成员置为 removed / paused / active，并加/解人为状态锁（members.status_locked）。
//
// 为什么需要锁：syncRoster 每个整点 cron 都把「名册里的成员」写成 active，
// 把「名册外非自助成员」写成 removed。这是名册驱动的可逆流转，但它会覆盖
// 维护者的人为决定——比如成员要求隐私退出，被人为置 removed 后，只要他的 id
// 还留在 data/members.json，下一个整点就会被名册静默复活。
// 本脚本加的锁让 syncRoster 与匿名自助注册都不能覆盖该状态。
//
// 默认干跑（只打印将要执行的 SQL）；加 --apply 才真正写库。
//
// 用法：
//   node scripts/set-member-status.mjs <成员id> <active|paused|removed> [--apply]
//   node scripts/set-member-status.mjs <成员id> --unlock [--apply]
//   node scripts/set-member-status.mjs --list [--locked]        # 列表/只看被锁住的
import { d1Execute, d1Query, BUMP_CACHE_BUST_SQL, lit } from "./_lib.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const listMode = args.includes("--list");
const onlyLocked = args.includes("--locked");
const unlock = args.includes("--unlock");
const rest = args.filter((a) => !a.startsWith("--"));

const STATUSES = ["active", "paused", "removed"];

function printRows(rows) {
  if (rows.length === 0) {
    console.log("（无匹配成员）");
    return;
  }
  for (const r of rows) {
    console.log(
      `  ${r.id}\t@${r.handle}\t${r.status}${r.status_locked ? "\t🔒锁定" : ""}\tself_registered=${r.self_registered}`
    );
  }
}

if (listMode) {
  const where = onlyLocked ? "WHERE status_locked = 1" : "";
  const rows = d1Query(
    `SELECT id, handle, status, status_locked, self_registered FROM members ${where} ORDER BY status, id`
  );
  console.log(`成员状态${onlyLocked ? "（仅锁定）" : ""}：`);
  printRows(rows);
  process.exit(0);
}

const [id, next] = rest;
if (!id) {
  console.error("用法：node scripts/set-member-status.mjs <成员id> <active|paused|removed> [--apply]");
  console.error("      node scripts/set-member-status.mjs <成员id> --unlock [--apply]");
  console.error("      node scripts/set-member-status.mjs --list [--locked]");
  process.exit(1);
}
if (!unlock && !STATUSES.includes(next)) {
  console.error(`状态必须是 ${STATUSES.join(" / ")} 之一（或用 --unlock 只解锁）`);
  process.exit(1);
}

const target = d1Query(`SELECT id, handle, status, status_locked FROM members WHERE id = ${lit(id)}`)[0];
if (!target) {
  console.error(`查无此成员：${id}`);
  process.exit(1);
}

const sql = unlock
  ? `UPDATE members SET status_locked = 0, updated_at = datetime('now') WHERE id = ${lit(id)};`
  : `UPDATE members SET status = ${lit(next)}, status_locked = 1, updated_at = datetime('now') WHERE id = ${lit(id)};`;

console.log(`成员 ${target.id}（@${target.handle}）：当前 ${target.status}${target.status_locked ? " 🔒" : ""}`);
console.log(apply ? "执行：" : "（干跑，未执行）将要执行：");
console.log(`  ${sql}`);
if (unlock) console.log("  解锁后：名册同步会在下一个整点按名册重新决定该成员状态");

if (!apply) {
  console.log("\n加 --apply 才写库。");
  process.exit(0);
}

// d1Execute 走「--remote --command」通道，写语句与读语句同样适用
d1Execute(sql);
d1Execute(BUMP_CACHE_BUST_SQL); // 状态变化影响榜单/列表，换数据版本让读端点立即刷新
console.log("✅ 已写库，cache_bust +1");
