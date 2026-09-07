-- 相似账号推荐：Grok 逐个 handle 扫描（同赛道分类模式）产出 3-5 个相似账号 + 理由。
-- 成员页展示外链；重复扫描时按 (member_id, handle) 幂等覆盖。
CREATE TABLE similar_accounts (
  member_id TEXT NOT NULL,
  handle TEXT NOT NULL,               -- 相似账号 handle（无 @）
  name TEXT,                          -- 显示名（可空）
  avatar TEXT,                        -- 头像 URL（可空）
  reason TEXT NOT NULL,               -- 相似理由（Grok 判断，中文一句话）
  difference TEXT,                    -- 与本人的主要差异（可空）
  created_at TEXT NOT NULL,           -- 扫描时间（ISO 8601）
  PRIMARY KEY (member_id, handle)
);

CREATE INDEX idx_similar_member ON similar_accounts (member_id);