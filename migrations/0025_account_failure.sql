-- 账号失效隔离：X 侧账号冻结/注销/改名后 SocialData 返回 404（确定性失败，重试无意义）。
-- fail_count 记连续 404 次数，达到阈值自动降为 suspended（退出采集池停烧额度，active 读端点自然摘除）；
-- suspended 成员每周探针一次，解封后采集成功即恢复 active。last_fail_at 同时是探针节拍的锚点。
ALTER TABLE members ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN last_fail_at TEXT;
