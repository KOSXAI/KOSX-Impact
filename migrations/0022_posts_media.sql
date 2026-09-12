-- 帖子富媒体底座：User Tweets 端点响应本就带 extended_entities.media / type / quoted_status，
-- 此前采集整包丢弃，导致内容页只看得见文字。本次把这些字段落库（零额外 API 调用）。
--
-- media：JSON 数组，元素 {type:photo|video|animated_gif, url, videoUrl?, width?, height?, durationMs?}。
--   照片 url 为 pbs 原图、视频 url 为封面图 + videoUrl 为最优 mp4。
-- tweet_type：tweet | reply | quote | retweet（X 原生分类，便于后续筛选原创/引用）。
-- quoted：JSON 对象（引用帖原文卡：handle/name/profileImage/text/url/media），非引用帖为 NULL。
-- 均为展示层字段，不进 30 天全量扫描的 POST_FIELDS（避免把媒体 JSON 灌进批量聚合）。
ALTER TABLE posts ADD COLUMN media TEXT;
ALTER TABLE posts ADD COLUMN tweet_type TEXT;
ALTER TABLE posts ADD COLUMN quoted TEXT;
