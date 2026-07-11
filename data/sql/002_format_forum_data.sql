-- ============================================================================
-- shsg8c1wiki 论坛数据格式化（参考脚本，按需运行）
-- ============================================================================
-- 用途：如果需要对现有帖子/评论做数据清洗
-- ============================================================================

-- 1. 检查帖子标题中是否有 HTML 实体需要解码
-- SELECT id, title FROM forum_posts WHERE title LIKE '%&amp;%' OR title LIKE '%&lt;%' OR title LIKE '%&gt;%';

-- 2. 如果发现，更新为纯文本（renderClient 会自动处理转义）
-- UPDATE forum_posts SET title = decode_html_entities(title) WHERE ...;

-- 3. 检查孤立的评论（post 已被删除）
-- SELECT fc.id, fc.post_id FROM forum_comments fc LEFT JOIN forum_posts fp ON fp.id = fc.post_id WHERE fp.id IS NULL;

-- 4. 清理孤立评论（CASCADE 应自动处理，此处为双重确认）
-- DELETE FROM forum_comments WHERE post_id NOT IN (SELECT id FROM forum_posts);

-- ============================================================================
-- 注：目前论坛功能刚上线，尚无遗留数据需要格式化。
-- 后续如果需要批量格式化工具有了再补。
-- ============================================================================
