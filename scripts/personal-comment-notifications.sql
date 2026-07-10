-- ============================================================================
-- shsg8c1wiki 个人页面评论通知功能 v3
-- 当有人评论某人的个人介绍页时（评论或回复），页面主人会收到通知
-- 在 Supabase SQL Editor 运行（一次即可）
-- ============================================================================
-- 改动说明：
--   1. wiki_users 新增 page_slug 列（唯一，个人页 URL slug → 用户映射）
--   2. 为所有有个人页的用户填充 page_slug
--   3. 重写 add_comment RPC，增加"页面所有者通知"逻辑
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. wiki_users 新增 page_slug 列
-- ============================================================
ALTER TABLE wiki_users ADD COLUMN IF NOT EXISTS page_slug text UNIQUE;

-- ============================================================
-- 2. 填充 page_slug（按中文姓名匹配）
--    data/contents/people/*.md 的 frontmatter title → wiki_users.name
-- ============================================================
UPDATE wiki_users SET page_slug = 'chen-wenyi'    WHERE name = '陈文一';
UPDATE wiki_users SET page_slug = 'chen-xiyan'    WHERE name = '陈希言';
UPDATE wiki_users SET page_slug = 'gui-jinxuan'   WHERE name = '桂锦煊';
UPDATE wiki_users SET page_slug = 'jiang-runqi'   WHERE name = '蒋润齐';
UPDATE wiki_users SET page_slug = 'kong-lingyi'   WHERE name = '孔令仪';
UPDATE wiki_users SET page_slug = 'li-che'        WHERE name = '李澈';
UPDATE wiki_users SET page_slug = 'li-yueran'     WHERE name = '李跃然';
UPDATE wiki_users SET page_slug = 'li-yuze'       WHERE name = '李裕泽';
UPDATE wiki_users SET page_slug = 'lin-qinqi'     WHERE name = '林沁圻';
UPDATE wiki_users SET page_slug = 'long-peilin'   WHERE name = '龙沛霖';
UPDATE wiki_users SET page_slug = 'luo-xihao'     WHERE name = '罗熙昊';
UPDATE wiki_users SET page_slug = 'min-huijie'    WHERE name = '闵汇杰';
UPDATE wiki_users SET page_slug = 'tong-qiyu'     WHERE name = '童麒宇';
UPDATE wiki_users SET page_slug = 'wang-yucheng'  WHERE name = '王禹程';
UPDATE wiki_users SET page_slug = 'wang-zi'       WHERE name = '王梓';
UPDATE wiki_users SET page_slug = 'wen-siyi'      WHERE name = '闻思奕';
UPDATE wiki_users SET page_slug = 'xiao-yichen'   WHERE name = '肖逸辰';
UPDATE wiki_users SET page_slug = 'xu-haolin'     WHERE name = '许皓麟';
UPDATE wiki_users SET page_slug = 'xu-zinan'      WHERE name = '许梓楠';
UPDATE wiki_users SET page_slug = 'xue-minzhe'    WHERE name = '薛旻喆';
UPDATE wiki_users SET page_slug = 'yang-jiarui'   WHERE name = '杨佳瑞';
UPDATE wiki_users SET page_slug = 'zhang-jinsu'   WHERE name = '张晋苏';
UPDATE wiki_users SET page_slug = 'zheng-mingze'  WHERE name = '郑鸣泽';
UPDATE wiki_users SET page_slug = 'zhou-fangyu'   WHERE name = '周方予';
UPDATE wiki_users SET page_slug = 'zhou-yijun'    WHERE name = '周义畯';

-- ============================================================
-- 3. 重写 add_comment RPC — 增加页面所有者通知
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_comment(
  p_page       text,
  p_author     text,
  p_content    text,
  p_parent_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id        uuid;
  parent_owner  uuid;
  page_owner    uuid;
  page_slug     text;
BEGIN
  INSERT INTO comments (page, author, content, parent_id, user_id, status, date)
  VALUES (
    p_page, p_author, p_content, p_parent_id,
    auth.uid(),
    'approved', now()
  )
  RETURNING id INTO new_id;

  -- ---- 回复通知（现有逻辑） ----
  -- 通知被回复的评论作者
  IF p_parent_id IS NOT NULL THEN
    SELECT c.user_id INTO parent_owner FROM comments c WHERE c.id = p_parent_id;
    IF parent_owner IS NOT NULL AND parent_owner <> auth.uid() THEN
      INSERT INTO notifications (user_id, from_user_id, comment_id, page, excerpt)
      VALUES (parent_owner, auth.uid(), new_id, p_page, left(p_content, 100));
    END IF;
  END IF;

  -- ---- 个人页面通知（新增） ----
  -- 当页格式为 people/<slug> 时，查找页面主人并发送通知
  -- 适用场景：
  --   - 有人在别人主页上发表了顶层评论
  --   - 有人在别人主页上回复了任意评论（即使回复的不是主人本人）
  -- 不重复通知：如果页面主人刚刚已被回复通知覆盖，则跳过
  IF p_page LIKE 'people/%' THEN
    -- 提取 'people/' 后面的 slug
    page_slug := split_part(p_page, '/', 2);

    SELECT id INTO page_owner FROM wiki_users WHERE page_slug = page_slug;

    IF page_owner IS NOT NULL AND page_owner <> auth.uid() THEN
      -- 避免与上方的回复通知重复（当页面主人 = 被回复者时）
      IF p_parent_id IS NULL
         OR parent_owner IS NULL
         OR parent_owner <> page_owner
      THEN
        INSERT INTO notifications (user_id, from_user_id, comment_id, page, excerpt)
        VALUES (page_owner, auth.uid(), new_id, p_page, left(p_content, 100));
      END IF;
    END IF;
  END IF;
END;
$$;

COMMIT;
