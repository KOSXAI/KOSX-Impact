-- 每日统计预聚合表：滚动采集时逐成员写入，看板/卡片读它替代实时计算
-- 一行 = 一个成员一个采集日的统计快照（幂等：同一成员同一天覆盖写）
CREATE TABLE daily_stats (
  member_id          TEXT NOT NULL REFERENCES members(id),
  stats_date         TEXT NOT NULL,              -- 采集日期 YYYY-MM-DD
  followers          INTEGER NOT NULL,
  growth             INTEGER NOT NULL,            -- 相对基线（名册 baseline 或首条快照）
  growth7d           INTEGER NOT NULL,
  growth30d          INTEGER NOT NULL,
  progress           INTEGER NOT NULL,            -- 0-100（相对 goal）
  streak_days        INTEGER NOT NULL,
  achieved           INTEGER NOT NULL DEFAULT 0,  -- 0/1：是否达成 goal
  overflow           INTEGER NOT NULL DEFAULT 0,  -- 超出 goal 的部分
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, stats_date)
);

CREATE INDEX idx_daily_stats_date ON daily_stats (stats_date);