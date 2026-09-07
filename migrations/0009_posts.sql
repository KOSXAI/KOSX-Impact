-- 帖子级活跃度数据底座：SocialData User Tweets 端点，每条帖子一行。
-- 浏览/赞/评论等互动数是「快变量」，随每次抓取刷新；full_text 全文内部保留，
-- 展示层只出摘要 + 原文外链（不全文搬运）。每日汇总表留待定时任务阶段再建。
CREATE TABLE posts (
  tweet_id  TEXT PRIMARY KEY,          -- id_str
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,            -- tweet_created_at（ISO 8601）
  views_count INTEGER,
  like_count INTEGER,
  reply_count INTEGER,
  retweet_count INTEGER,
  quote_count INTEGER,
  bookmark_count INTEGER,
  text TEXT,                           -- full_text 全文（内部保留）
  lang TEXT,
  recorded_at TEXT NOT NULL            -- 本次抓取时间（ISO 8601）
);

CREATE INDEX idx_posts_member_created ON posts (member_id, created_at DESC);
