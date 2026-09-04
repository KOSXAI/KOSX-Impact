-- 台阶制改版后的遗留字段清理：goal（个人目标）/旧式进度/采集连胜等不再被任何 UI 使用，
-- 目标与进度一律由均匀成就阶梯（milestones.ts）按当前粉丝量实时推导。
ALTER TABLE members DROP COLUMN goal;
ALTER TABLE daily_stats DROP COLUMN progress;
ALTER TABLE daily_stats DROP COLUMN streak_days;
ALTER TABLE daily_stats DROP COLUMN achieved;
ALTER TABLE daily_stats DROP COLUMN overflow;
