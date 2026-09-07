-- 帖子表索引：每日采集后 posts 行数持续增长（76 人 × ~20 帖/天），
-- 精华帖/互动 Top 的排序窗口与近 N 天过滤必须有索引支撑，避免全表扫描。
CREATE INDEX idx_posts_views ON posts (views_count DESC);
CREATE INDEX idx_posts_created ON posts (created_at);