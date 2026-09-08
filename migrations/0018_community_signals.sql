-- 社群信号（社区级洞察）：kind = following(成员们共同关注的外部大V) / taste(社群帖子中热议的外部账号)。
-- 计数为「有多少位成员关注/提到该账号」，按 (kind, handle) 幂等覆盖，每日刷新。
CREATE TABLE IF NOT EXISTS community_signal_counts (
  kind TEXT NOT NULL,
  handle TEXT NOT NULL,
  name TEXT,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, handle)
);