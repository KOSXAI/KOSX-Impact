-- 成员头像：采集时从数据源拿到 X 公开头像 URL，展示在看板成员条目与详情页
ALTER TABLE members ADD COLUMN profile_image TEXT;
