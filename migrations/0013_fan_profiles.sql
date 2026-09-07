-- 粉丝圈画像：SocialData followers 端点采样聚合（每账号约 200 粉丝样本），低频月度刷新。
-- 证明成员粉丝质量（KOL 浓度 / 认证率 / 活跃度），不是泛泛的粉丝量数字。
CREATE TABLE fan_profiles (
  member_id TEXT PRIMARY KEY,
  sampled_at TEXT NOT NULL,           -- 采样时间（ISO 8601）
  sample_size INTEGER NOT NULL,       -- 有效样本数（去重后）
  avg_followers REAL,                 -- 样本平均粉丝量
  pct_followers_1k REAL,              -- 千粉以上占比（0-100）
  pct_followers_10k REAL,             -- 万粉以上占比（KOL，0-100）
  verified_pct REAL,                  -- 认证账号占比（0-100）
  avg_friends REAL,                   -- 样本平均关注数
  avg_tweets REAL,                    -- 样本平均发帖数
  avg_age_days REAL,                  -- 样本账号平均年龄（天，0 = 全是新号）
  top_handles TEXT                    -- JSON：样本内粉丝量 Top 20（[{handle,name,followers}]）
);