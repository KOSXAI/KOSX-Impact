-- 人为状态锁：维护者手动设置的状态（如隐私退出置 removed）不被名册同步覆盖。
-- 背景：名册（data/members.json）是追踪名单的事实来源，syncRoster 每次整点 cron 都会
-- 把名册内成员写成 active；名册外的成员（非自助注册）标记 removed。这是可逆的
-- 「名册驱动」状态流转。但维护者手动置 removed 的成员（隐私退出等）与前者语义不同——
-- 名册里可能还留着他的 id，旧逻辑会在下一个整点把他静默改回 active。
-- 本列把两种来源分开：status_locked = 1 表示当前状态是人为决定，名册同步与
-- 匿名自助注册都不得覆盖；要恢复必须先由维护者解除锁（见 scripts/set-member-status.mjs）。
ALTER TABLE members ADD COLUMN status_locked INTEGER NOT NULL DEFAULT 0;
