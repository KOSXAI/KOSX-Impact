-- 社群内部真实关注网：成员成员互相关注对（SocialData Following 端点低频采集）。
-- 互推（帖子正文 @）是嘴上说，互相关注是真实连接；大屏信号带展示真实关注密度。
-- 键用 X 数字用户 ID（int64 字符串存储），member_id 便于与成员表联查。
CREATE TABLE follows (
  follower_user_id TEXT NOT NULL,
  followed_user_id TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (follower_user_id, followed_user_id)
);
CREATE INDEX idx_follows_followed ON follows (followed_user_id);
