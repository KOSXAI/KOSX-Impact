-- 成员赛道与标签：人工/agent 分类产物入库（慢变量，分类脚本低频写入）。
-- tracks 为赛道数组（5 正式 + 综合兜底），tags 为自由描述标签数组；
-- 存储 JSON 文本，读取时由查询层 parse。与 bio/location 同模式，不参与 daily_stats。
ALTER TABLE members ADD COLUMN tracks TEXT;  -- JSON 数组，如 ["AI工具","出海"]
ALTER TABLE members ADD COLUMN tags TEXT;    -- JSON 数组，如 ["Agent","00后","长期主义"]
