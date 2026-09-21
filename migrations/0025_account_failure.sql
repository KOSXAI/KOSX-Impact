-- 账号失效隔离：X 侧账号冻结/注销/改名后 SocialData 返回 404（确定性失败，重试无意义）。
-- fail_count 记连续 404 次数，达到阈值自动降为 suspended（退出采集池停烧额度，active 读端点自然摘除）。
-- 无自动探针（解封无法预测，定时探测就是白烧计费调用）：恢复只能手动置回 active。
-- last_fail_at 保留为最近一次失败的诊断记录。
ALTER TABLE members ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN last_fail_at TEXT;
