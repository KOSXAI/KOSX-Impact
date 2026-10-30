-- 自助加入排除名单：登记后该 handle 不参与自助加入/恢复，名册同步也不复活。
-- 仅内部维护使用，不提供对外读取接口；历史快照与帖子数据保留。
CREATE TABLE IF NOT EXISTS excluded_handles (
  handle     TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
