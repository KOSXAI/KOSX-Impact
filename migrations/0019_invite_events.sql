-- 邀请裂变追踪：谁带来了最多新成员（分享链接带 ?invite=成员id，新成员自助加入后上报一次）。
CREATE TABLE IF NOT EXISTS invite_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_id TEXT NOT NULL,
  invited_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (inviter_id, invited_member_id)
);