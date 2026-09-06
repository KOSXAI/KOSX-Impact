-- 成员档案扩展：SocialData 同一响应里的公开资料字段（零额外 API 调用）
-- 慢变量存 members 最新值；计数类（列表收录/点赞）进 snapshots 时序

ALTER TABLE members ADD COLUMN bio TEXT;              -- X 简介（description）
ALTER TABLE members ADD COLUMN location TEXT;         -- 地区（自由文本）
ALTER TABLE members ADD COLUMN url TEXT;              -- 主页外链
ALTER TABLE members ADD COLUMN banner_url TEXT;       -- 横幅图（档案页 hero）
ALTER TABLE members ADD COLUMN x_created_at TEXT;     -- X 账号创建时间（X 龄）
ALTER TABLE members ADD COLUMN verified INTEGER;      -- 认证（0/1）

ALTER TABLE snapshots ADD COLUMN listed_count INTEGER;     -- 被列表收录数
ALTER TABLE snapshots ADD COLUMN favourites_count INTEGER; -- 点赞数（该账号发出的）
