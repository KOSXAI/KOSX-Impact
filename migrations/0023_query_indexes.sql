-- 查询层索引补全：为读端点的排序/范围/分组查询提供可提前终止的访问路径。
-- 背景：D1 按 rows_read 计费，而以下查询此前只能全表（或全索引）扫描后再排序/分组，
-- 每次缓存重建都要按表行数付费，随 posts/snapshots/member_mentions 增长而线性变贵。

-- ① 精华帖排序（getTopPosts）：排序键是「浏览缺失时用五项互动合计兜底」的 COALESCE 表达式，
--    表达式排序无法用普通列索引，只能全窗口扫描 + temp B-tree。建表达式索引后按序扫描、
--    取满 LIMIT 即停（实测结果集与原查询逐条一致）。
CREATE INDEX IF NOT EXISTS idx_posts_value ON posts(
  COALESCE(views_count, COALESCE(like_count, 0) + COALESCE(reply_count, 0) + COALESCE(retweet_count, 0) + COALESCE(quote_count, 0) + COALESCE(bookmark_count, 0)) DESC
);

-- ② 强互动成员统计：WHERE created_at >= ? AND views_count >= ? GROUP BY member_id。
--    此处按「覆盖索引让窗口过滤+分组全在索引内完成」的推断建了索引，但线上实测反了
--    （posts 有 90 天保留窗口，30 天窗口≈整表 98%：范围只削掉约 2%，却让 GROUP BY
--    多背一次排序，rows_read 7422→9861）。由 0024 撤除；本文件作为已应用的历史保留不动。
CREATE INDEX IF NOT EXISTS idx_posts_created_views_member ON posts(created_at, views_count, member_id);

-- ③ 成员被提及近 30 天/年内按成员计数：原索引是 (member_id, mentioned_at)，
--    而查询按第二列做范围过滤 → 只能整索引扫描；补一列序相反的索引让范围可直接 seek。
CREATE INDEX IF NOT EXISTS idx_member_mentions_mentioned ON member_mentions(mentioned_at, member_id);

-- ④ 站外提及按日聚合：查询用 substr(collected_at, 1, 10)（历史写入格式为空格分隔，
--    不能直接与 ISO 串比较），表达式包住列使原索引失效；表达式索引命中该形态。
CREATE INDEX IF NOT EXISTS idx_mentions_day ON mentions(substr(collected_at, 1, 10));

-- ⑤ 年度趋势 / 日归档按时间窗口读快照：原索引是 (member_id, recorded_at)，
--    按 recorded_at 做范围过滤用不上 → 全表扫描（该表每日 +活跃成员数行，增长最快）。
CREATE INDEX IF NOT EXISTS idx_snapshots_recorded ON snapshots(recorded_at, member_id, followers);

-- ⑥ 自助更新队列：提交防抖查询（member_id + requested_at 范围）、读回最近完成时间
--    （member_id + status + MAX(processed_at)）、失败态探测 —— 三条此前都是全表扫描。
CREATE INDEX IF NOT EXISTS idx_refresh_queue_member ON refresh_queue(member_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_refresh_queue_member_status ON refresh_queue(member_id, status, processed_at);

-- ⑦ 登阶记录按时间取：年度榜按 achieved_at 范围、日归档按 achieved_at 的日期取。
CREATE INDEX IF NOT EXISTS idx_milestones_achieved ON milestones(achieved_at);
CREATE INDEX IF NOT EXISTS idx_milestones_day ON milestones(substr(achieved_at, 1, 10));

-- ⑧ 自助注册每日名额闸门：按 joined_at 当日计数（只数自助注册行，用部分索引）。
CREATE INDEX IF NOT EXISTS idx_members_self_registered_day ON members(joined_at) WHERE self_registered = 1;
