-- 成员自助注册：看板「加入追踪」弹窗直接加入（不走 GitHub 申请、无审批流）。
-- self_registered=1 的成员由 syncRoster 保留（名册同步的 removed 清扫只作用于名册体系成员）；
-- 退出/移除由维护者置 status='removed' 即停止追踪与展示，本人重新提交可自行恢复。
ALTER TABLE members ADD COLUMN self_registered INTEGER NOT NULL DEFAULT 0;
