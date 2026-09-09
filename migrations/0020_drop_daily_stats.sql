-- 0020: 下线 daily_stats 表。
-- 该表只写不读：写入方是采集链路的每日预聚合，但看板/趋势的实际读端全部走
-- 快照窗口推导（stats.ts 趋势）与在线聚合（queries/），从未消费此表。
-- 删除写入路径后（collector.ts 同步移除），表一并 DROP，数据无独有信息
-- （快照时序是其严格超集）。
DROP TABLE IF EXISTS daily_stats;
