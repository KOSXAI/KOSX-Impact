-- members.status 索引：读端点按 status='active' 过滤（此前为全表扫描）
CREATE INDEX idx_members_status ON members (status);