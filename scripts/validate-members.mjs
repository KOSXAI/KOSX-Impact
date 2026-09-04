// 校验 data/members.json 的结构：字段类型、格式、id/handle 唯一性。
// CI 与本地 `npm run validate:members` 都会执行。
import { readFileSync } from "node:fs";

const roster = JSON.parse(
  readFileSync(new URL("../data/members.json", import.meta.url), "utf8")
);

const errors = [];

function fail(message) {
  errors.push(message);
}

if (!roster || !Array.isArray(roster.members)) {
  console.error("❌ 名册缺少 members 数组");
  process.exit(1);
}

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const seenIds = new Set();
const seenHandles = new Set(); // X 用户名大小写不敏感，按小写去重

roster.members.forEach((member, i) => {
  const label = `members[${i}]${member?.handle ? ` (@${member.handle})` : ""}`;
  if (typeof member !== "object" || member === null) {
    return fail(`${label} 必须是对象`);
  }
  if (typeof member.id !== "string" || !ID_RE.test(member.id)) {
    fail(`${label} 的 id 格式不合法（小写字母/数字开头，可含连字符下划线）`);
  }
  if (typeof member.handle !== "string" || !HANDLE_RE.test(member.handle)) {
    fail(`${label} 的 handle 格式不合法（1-15 位字母数字下划线，不含 @）`);
  }
  if (member.displayName !== undefined && typeof member.displayName !== "string") {
    fail(`${label} 的 displayName 必须是字符串`);
  }
  if (typeof member.joinedAt !== "string" || !DATE_RE.test(member.joinedAt)) {
    fail(`${label} 的 joinedAt 格式不合法（YYYY-MM-DD）`);
  }
  if (
    member.baselineFollowers !== undefined &&
    (!Number.isInteger(member.baselineFollowers) || member.baselineFollowers < 0)
  ) {
    fail(`${label} 的 baselineFollowers 必须是非负整数`);
  }
  if (seenIds.has(member.id)) fail(`${label} 的 id 与其他成员重复`);
  if (seenHandles.has(member.handle.toLowerCase())) {
    fail(`${label} 的 handle 与其他成员重复（大小写不敏感）`);
  }
  seenIds.add(member.id);
  seenHandles.add(member.handle.toLowerCase());
});

if (errors.length > 0) {
  console.error(`❌ 名册校验失败（${errors.length} 处）：`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`✅ 名册校验通过：${roster.members.length} 位成员`);
