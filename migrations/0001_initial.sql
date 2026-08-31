-- KOSX Impact 初始表结构

-- members: 被追踪的成员（当前仅 X 平台，platform 字段为多平台预留）
CREATE TABLE members (
  id           TEXT PRIMARY KEY,                -- 稳定标识（创建时生成，之后不随 handle 变化）
  handle       TEXT NOT NULL UNIQUE,            -- X handle（不含 @）
  display_name TEXT,
  platform     TEXT NOT NULL DEFAULT 'x',
  status       TEXT NOT NULL DEFAULT 'active',  -- active | paused | removed
  goal         INTEGER NOT NULL DEFAULT 10000,  -- 当前阶段目标粉丝量（Road to 10K 默认 10000）
  joined_at    TEXT NOT NULL,                   -- 加入追踪的日期（YYYY-MM-DD）
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- snapshots: 每日快照，成长曲线的数据源（每个成员每天至多一条）
CREATE TABLE snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL REFERENCES members(id),
  followers   INTEGER NOT NULL,
  following   INTEGER,
  posts       INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_snapshots_member_date ON snapshots (member_id, recorded_at);
CREATE UNIQUE INDEX idx_snapshots_member_day ON snapshots (member_id, date(recorded_at));

-- milestones: 里程碑事件（粉丝量首次跨过阈值，如 1000 / 5000 / 10000）
CREATE TABLE milestones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL REFERENCES members(id),
  threshold   INTEGER NOT NULL,
  achieved_at TEXT NOT NULL,
  announced   INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_milestones_member_threshold ON milestones (member_id, threshold);

-- site_meta: 站点元数据（最近同步时间等）
CREATE TABLE site_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
