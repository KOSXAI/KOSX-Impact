-- 帖子曝光增量底座：posts 增加 views_prev（上次抓取的浏览数）。
-- 写库时把旧 views 保留进 views_prev（ON CONFLICT 覆盖，不用 REPLACE 以免丢历史），
-- 「今日曝光增量」= views_count - views_prev（限近 24h 内刷新过的帖子）。
ALTER TABLE posts ADD COLUMN views_prev INTEGER;