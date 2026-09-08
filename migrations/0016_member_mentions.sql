-- 成员被提及（Member Mentions）：SocialData Search 按 `@handle -filter:replies` 拉「被谁提及」。
-- 「被讨论热度」数据源：影响力指数新维度 + 榜单「被提及榜」（被讨论热度）。
CREATE TABLE IF NOT EXISTS member_mentions (
  member_id TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  author_handle TEXT,
  author_name TEXT,
  text TEXT,
  mentioned_at TEXT NOT NULL,
  collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, tweet_id)
);
CREATE INDEX IF NOT EXISTS idx_member_mentions_member ON member_mentions(member_id, mentioned_at);