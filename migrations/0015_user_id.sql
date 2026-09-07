-- members 持久化 X 数字用户 ID（id_str）：每日采集的 profile 响应里已有但未入库，
-- 导致粉丝采样/素材拉取等批量任务每次都重复调 profile 只为拿 userId。
-- 入库后下游全部读库，一次获取全局复用。
ALTER TABLE members ADD COLUMN user_id TEXT;
CREATE INDEX idx_members_user_id ON members (user_id);