-- ============================================================================
-- shsg8c1wiki 论坛帖子可见性迁移 v4
-- 在 Supabase SQL Editor 运行（一次即可）
-- ============================================================================
-- 改动说明：
--   1. forum_posts 新增 excluded_visibility 列（UUID 数组，指定哪些用户不可见）
--   2. 创建 get_all_users RPC（前端获取用户列表用）
--   3. 重写 create_forum_post RPC（支持 excluded_visibility 参数）
--   4. 重写 get_forum_posts / get_forum_post（按可见性过滤）
--   5. 重写 update_forum_post（支持 excluded_visibility 参数）
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. forum_posts 新增 excluded_visibility 列
--     默认空数组 = 全部可见
-- ============================================================
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS excluded_visibility uuid[] NOT NULL DEFAULT '{}';

-- ============================================================
-- 2. get_all_users — 获取全部用户（排除 test 账号）
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(id uuid, username text, name text)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, username, name
  FROM wiki_users
  WHERE username IS DISTINCT FROM 'test'
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users TO PUBLIC;

-- ============================================================
-- 3. 重写 create_forum_post — 支持 excluded_visibility
-- ============================================================
DROP FUNCTION IF EXISTS public.create_forum_post(text, text);

CREATE OR REPLACE FUNCTION public.create_forum_post(
  p_title               text,
  p_content             text,
  p_excluded_visibility uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
  v_username TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  SELECT username INTO v_username FROM wiki_users WHERE id = auth.uid();
  IF v_username IS NULL THEN
    RAISE EXCEPTION '用户不存在';
  END IF;

  INSERT INTO forum_posts (title, content, author_id, author_username, excluded_visibility)
  VALUES (p_title, p_content, auth.uid(), v_username, p_excluded_visibility)
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_forum_post(text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_forum_post(text, text, uuid[]) TO authenticated;

-- ============================================================
-- 4. 重写 get_forum_posts — 按 excluded_visibility 过滤
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_forum_posts()
RETURNS TABLE(
  id              uuid,
  title           text,
  content         text,
  author_id       uuid,
  author_username text,
  author_color    text,
  created_at      timestamptz,
  updated_at      timestamptz,
  upvotes         integer,
  downvotes       integer,
  comment_count   integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fp.id,
    fp.title,
    fp.content,
    fp.author_id,
    fp.author_username,
    fp.author_color,
    fp.created_at,
    fp.updated_at,
    fp.upvotes,
    fp.downvotes,
    fp.comment_count
  FROM forum_posts fp
  WHERE
    fp.excluded_visibility IS NULL
    OR fp.excluded_visibility = '{}'
    OR auth.uid() IS NULL
    OR auth.uid() = fp.author_id
    OR NOT (auth.uid() = ANY(fp.excluded_visibility))
  ORDER BY fp.created_at DESC;
END;
$$;

-- ============================================================
-- 5. 重写 get_forum_post — 按 excluded_visibility 过滤
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_forum_post(p_post_id uuid)
RETURNS TABLE(
  id              uuid,
  title           text,
  content         text,
  author_id       uuid,
  author_username text,
  author_color    text,
  created_at      timestamptz,
  updated_at      timestamptz,
  upvotes         integer,
  downvotes       integer,
  comment_count   integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fp.id,
    fp.title,
    fp.content,
    fp.author_id,
    fp.author_username,
    fp.author_color,
    fp.created_at,
    fp.updated_at,
    fp.upvotes,
    fp.downvotes,
    fp.comment_count
  FROM forum_posts fp
  WHERE fp.id = p_post_id
    AND (
      fp.excluded_visibility IS NULL
      OR fp.excluded_visibility = '{}'
      OR auth.uid() IS NULL
      OR auth.uid() = fp.author_id
      OR NOT (auth.uid() = ANY(fp.excluded_visibility))
    );
END;
$$;

-- ============================================================
-- 6. 重写 update_forum_post — 支持 excluded_visibility
-- ============================================================
DROP FUNCTION IF EXISTS public.update_forum_post(uuid, text, text);

CREATE OR REPLACE FUNCTION public.update_forum_post(
  p_post_id             uuid,
  p_title               text,
  p_content             text,
  p_excluded_visibility uuid[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  SELECT author_id INTO v_author FROM forum_posts WHERE id = p_post_id;
  IF v_author IS NULL THEN
    RAISE EXCEPTION '帖子不存在';
  END IF;

  IF v_author <> auth.uid() THEN
    RAISE EXCEPTION '只能编辑自己的帖子';
  END IF;

  IF p_excluded_visibility IS NOT NULL THEN
    UPDATE forum_posts
    SET title = p_title, content = p_content,
        excluded_visibility = p_excluded_visibility,
        updated_at = now()
    WHERE id = p_post_id;
  ELSE
    UPDATE forum_posts
    SET title = p_title, content = p_content, updated_at = now()
    WHERE id = p_post_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_forum_post(uuid, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_forum_post(uuid, text, text, uuid[]) TO authenticated;

COMMIT;
