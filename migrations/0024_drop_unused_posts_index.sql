-- 撤掉 0023 里为「强互动成员」查询建的 covering index。
-- 0023 的假设是「覆盖索引让范围过滤 + 分组全在索引内完成」，但线上实测反了：
--   posts 有 90 天保留窗口，30 天窗口 ≈ 整表 98%，范围 seek 只削掉约 2% 的行，
--   却让扫描顺序从 member_id 序变成 created_at 序，GROUP BY 因此多背一次排序。
--   实测 rows_read：原计划 7422 → 改走该覆盖索引 9861（同一线上数据、同一查询）。
-- posts 是最热写表（每次采集都 upsert），留一个用不上的索引纯属写放大，故删除。
-- 注：0023 已应用到线上，故用新迁移撤回，而不是改历史迁移文件。
DROP INDEX IF EXISTS idx_posts_created_views_member;
