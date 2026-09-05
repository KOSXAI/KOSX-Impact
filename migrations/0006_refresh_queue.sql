-- 成员自助更新队列：成员在网页提交 handle 触发即时刷新。
-- 提交先入队（同一成员同时最多一条 pending，重复点击自动合并），
-- 消费走与 cron 采集完全相同的写入管线（writeSnapshot/checkMilestones/writeDailyStats），
-- 管线里永远只有真实 API 数据，无手工填报口径。
-- 两条消费通道：
--   即时通道：提交时 CAS 抢 site_meta 全局节流槽（SocialData 每分钟 3 次免费额度 → 最小 21 秒间隔），
--             抢到当场处理最旧一条；抢不到留在队列。
--   兜底通道：每次 cron collect() 开头按 FIFO 清一小批 pending。
CREATE TABLE refresh_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       TEXT NOT NULL REFERENCES members(id),
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | done | failed
  attempts        INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  requested_at    TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at    TEXT,
  followers_after INTEGER                           -- 处理完成时的粉丝量（审计用）
);

-- 同一成员同时至多一条 pending：INSERT OR IGNORE 实现提交去重
CREATE UNIQUE INDEX idx_refresh_queue_pending ON refresh_queue (member_id) WHERE status = 'pending';
-- 消费按 FIFO 取 pending
CREATE INDEX idx_refresh_queue_status ON refresh_queue (status, requested_at);
