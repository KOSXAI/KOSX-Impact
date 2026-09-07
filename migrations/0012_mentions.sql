-- KOSX 声量监控（站外提及）：Grok 本机定时搜索 X 上提及「KOSX」等关键词，结构化入库。
-- 数据供看板「品牌声量」区块；keyword 区分命中查询，(keyword, tweet_url) 唯一去重
-- （同帖命中多词只入一次；tweet_url 可能为空，SQLite 唯一索引不约束 NULL）。
CREATE TABLE mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,            -- 命中关键词（KOSX / impact.kosx.ai / 万粉影响力计划）
  author_handle TEXT NOT NULL,      -- 提及账号 handle（无 @）
  author_name TEXT,                 -- 提及账号显示名（可能为空）
  text TEXT NOT NULL,               -- 提及内容摘要
  tweet_url TEXT,                   -- 原文链接（可能为空）
  sentiment TEXT,                   -- 情绪：positive/neutral/negative（Grok 判断，可空）
  collected_at TEXT NOT NULL        -- 采集时间（ISO 8601）
);

CREATE UNIQUE INDEX idx_mentions_dedup ON mentions (keyword, tweet_url);
CREATE INDEX idx_mentions_collected ON mentions (collected_at DESC);