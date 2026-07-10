-- ============================================================================
-- shsg8c1wiki 安全升级迁移 v2
-- 在 Supabase SQL Editor（或 Management API）运行
-- ============================================================================
-- 修改内容：
--   1. wiki_users 加 role 列
--   2. 创建 auth.users 记录（同步现有用户到 Supabase Auth）
--   3. login RPC（服务端哈希比对，不泄漏 password_hash）
--   4. 收紧 find_user_by_name / find_user_by_username 返回列
--   5. 重写 set_password（服务端接收原始密码）
--   6. 重写 change_username（服务端接收原始密码）
--   7. 重写 update_comment_status（auth.uid() + role 检查）
--   8. 重写 delete_comment（auth.uid() + role 替代硬编码 UUID）
--   9. 重写 add_comment（auth.uid() 替代 p_user_id）
--  10. 重写通知 RPC（auth.uid() 替代 p_user_id）
--  11. 撤销 PUBLIC 权限，授予 authenticated
--  12. 收紧 RLS 策略
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. 用户角色系统
-- ============================================================
ALTER TABLE wiki_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'super_admin'));

-- 已知管理员（从源码中的硬编码 UUID 推导）
UPDATE wiki_users SET role = 'super_admin' WHERE id = 'e7da1be9-29f3-41d6-a44a-e40b143c75f5';
UPDATE wiki_users SET role = 'admin'      WHERE id = '3d5cb49d-f1c4-4661-879e-955e7ceebf62';

-- ============================================================
-- 2. 迁移 wiki_users → auth.users（允许 RPC 使用 auth.uid()）
--    初始密码 = 学号，有密码的用户首次登录后自动升级
-- ============================================================
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, is_sso_user
)
SELECT
  w.id,
  '00000000-0000-0000-0000-000000000000',
  w.student_id || '@wiki.local',
  crypt(w.student_id, gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object(
    'username', w.username,
    'name', w.name,
    'student_id', w.student_id,
    'role', w.role
  ),
  w.created_at,
  now(),
  'authenticated',
  false
FROM wiki_users w
ON CONFLICT (id) DO UPDATE SET
  email                     = excluded.email,
  encrypted_password        = excluded.encrypted_password,
  raw_user_meta_data        = excluded.raw_user_meta_data,
  updated_at                = excluded.updated_at;

-- 确认 auth.identity 记录也存在
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  w.id,
  w.id,
  jsonb_build_object(
    'sub', w.id::text,
    'email', w.student_id || '@wiki.local'
  ),
  'email',
  w.student_id || '@wiki.local',
  now(),
  now(),
  now()
FROM wiki_users w
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. login RPC（服务端哈希比对）
-- ------------------------------------------------------------
-- 替代 auth.ts 中的 find_user_by_name + 客户端 SHA-256 比较
-- 永不泄漏 password_hash 和 student_id（除非认证成功）
-- ============================================================
CREATE OR REPLACE FUNCTION public.login(
  p_name_or_username text,
  p_password        text
)
RETURNS TABLE(
  id           uuid,
  name         text,
  username     text,
  student_id   text,
  has_password boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec wiki_users%ROWTYPE;
BEGIN
  SELECT * INTO v_rec
  FROM wiki_users
  WHERE name = p_name_or_username OR username = p_name_or_username
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 有密码 → SHA-256 服务端比对
  IF v_rec.password_hash IS NOT NULL THEN
    IF encode(digest(p_password, 'sha256'), 'hex') = v_rec.password_hash THEN
      RETURN QUERY
      SELECT v_rec.id, v_rec.name, v_rec.username,
             v_rec.student_id, true;
    END IF;
  ELSE
    -- 无密码 → 比对学号
    IF p_password = v_rec.student_id THEN
      RETURN QUERY
      SELECT v_rec.id, v_rec.name, v_rec.username,
             v_rec.student_id, false;
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- 4. 收紧 find_user_by_name / find_user_by_username
--    去掉 password_hash 和 student_id 返回列
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_user_by_name(p_name text)
RETURNS TABLE(id uuid, name text, username text)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, username FROM wiki_users WHERE name = p_name LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.find_user_by_username(p_username text)
RETURNS TABLE(id uuid, name text, username text)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, username FROM wiki_users WHERE username = p_username LIMIT 1;
$$;

-- ============================================================
-- 5. set_password（服务端接收原始密码，内部 SHA-256 验证）
--    + 设完同步更新 auth.users 的密码
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_password(
  p_student_id        text,
  p_old_password      text,
  p_new_password      text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
  v_user_id uuid;
BEGIN
  SELECT id, password_hash INTO v_user_id, v_current
  FROM wiki_users WHERE student_id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION '账号不存在'; END IF;

  -- 验证旧密码
  IF v_current IS NOT NULL THEN
    IF encode(digest(p_old_password, 'sha256'), 'hex') <> v_current THEN
      RAISE EXCEPTION '当前密码错误';
    END IF;
  ELSE
    IF p_old_password <> p_student_id THEN
      RAISE EXCEPTION '学号验证未通过';
    END IF;
  END IF;

  -- 更新 wiki_users
  UPDATE wiki_users
  SET password_hash = encode(digest(p_new_password, 'sha256'), 'hex'),
      updated_at    = now()
  WHERE student_id = p_student_id;

  -- 同步更新 auth.users（注意：auth 用 bcrypt，wiki_users 保留 SHA-256）
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at         = now()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 6. change_username（服务端接收原始密码）
-- ============================================================
CREATE OR REPLACE FUNCTION public.change_username(
  p_student_id   text,
  p_password     text,
  p_new_username text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
  v_user_id uuid;
BEGIN
  IF p_new_username IS NULL OR length(trim(p_new_username)) = 0 THEN
    RAISE EXCEPTION '用户名不能为空';
  END IF;
  IF length(p_new_username) > 20 THEN
    RAISE EXCEPTION '用户名不能超过 20 个字符';
  END IF;
  IF trim(p_new_username) = '匿名' THEN
    RAISE EXCEPTION '用户名不能为"匿名"';
  END IF;

  SELECT id, password_hash INTO v_user_id, v_current
  FROM wiki_users WHERE student_id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION '账号不存在'; END IF;

  IF v_current IS NOT NULL THEN
    IF encode(digest(p_password, 'sha256'), 'hex') <> v_current THEN
      RAISE EXCEPTION '密码错误';
    END IF;
  ELSE
    IF p_password <> p_student_id THEN
      RAISE EXCEPTION '学号验证未通过';
    END IF;
  END IF;

  BEGIN
    UPDATE wiki_users
    SET username   = trim(p_new_username),
        updated_at = now()
    WHERE student_id = p_student_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION '该用户名已被使用';
  END;

  -- 同步 auth 元数据
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('username', trim(p_new_username)),
      updated_at         = now()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 7. update_comment_status — auth.uid() + role 检查
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_comment_status(
  p_comment_id uuid,
  p_status     text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM wiki_users
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION '无审核权限';
  END IF;

  UPDATE comments SET status = p_status WHERE id = p_comment_id;
END;
$$;

-- ============================================================
-- 8. delete_comment — auth.uid() + role 替代硬编码 UUID
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_comment(p_comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_uid UUID;
  v_caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  SELECT role INTO v_caller_role FROM wiki_users WHERE id = auth.uid();
  SELECT user_id INTO v_author_uid FROM comments WHERE id = p_comment_id;

  -- super_admin 可删任何
  IF v_caller_role = 'super_admin' THEN
    DELETE FROM comments WHERE id = p_comment_id;
    RETURN FOUND;
  END IF;

  -- admin 可删非 super_admin 的评论
  IF v_caller_role = 'admin' THEN
    IF v_author_uid IS NULL THEN
      DELETE FROM comments WHERE id = p_comment_id;
      RETURN FOUND;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM wiki_users WHERE id = v_author_uid AND role = 'super_admin') THEN
      DELETE FROM comments WHERE id = p_comment_id;
      RETURN FOUND;
    END IF;
    RETURN FALSE;
  END IF;

  -- 自己的评论
  IF v_author_uid = auth.uid() THEN
    DELETE FROM comments WHERE id = p_comment_id;
    RETURN FOUND;
  END IF;

  RETURN FALSE;
END;
$$;

-- ============================================================
-- 9. add_comment — auth.uid() 替代 p_user_id
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
BEGIN
  INSERT INTO comments (page, author, content, parent_id, user_id, status, date)
  VALUES (
    p_page, p_author, p_content, p_parent_id,
    auth.uid(),  -- NULL 时 = 匿名评论
    'approved', now()
  )
  RETURNING id INTO new_id;

  -- 回复通知
  IF p_parent_id IS NOT NULL AND auth.uid() IS NOT NULL THEN
    SELECT c.user_id INTO parent_owner FROM comments c WHERE c.id = p_parent_id;
    IF parent_owner IS NOT NULL AND parent_owner <> auth.uid() THEN
      INSERT INTO notifications (user_id, from_user_id, comment_id, page, excerpt)
      VALUES (parent_owner, auth.uid(), new_id, p_page, left(p_content, 100));
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- 10. 通知 RPC — auth.uid() 替代 p_user_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_notifications()
RETURNS TABLE(
  id            uuid,
  from_username text,
  page          text,
  excerpt       text,
  read          boolean,
  created_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  RETURN QUERY
  SELECT n.id, w.username, n.page, n.excerpt, n.read, n.created_at
  FROM notifications n
  LEFT JOIN wiki_users w ON w.id = n.from_user_id
  WHERE n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;

  SELECT COUNT(*) INTO v_count
  FROM notifications
  WHERE user_id = auth.uid() AND read = false;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;

  UPDATE notifications SET read = true
  WHERE id = p_notification_id AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_notifications()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;

  UPDATE notifications SET read = true
  WHERE user_id = auth.uid() AND read = false;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 11. 权限收紧 — 只保留 PUBLIC 对公开 RPC 的权限
-- ============================================================
-- 公开（无需登录）：
--   login, find_user_by_name, find_user_by_username,
--   get_page_comments

-- 撤回：敏感 RPC
REVOKE EXECUTE ON FUNCTION set_password              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION change_username            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_comment_status      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_comment             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION add_comment                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_all_comments            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_all_page_comments       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_notifications           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_unread_count            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_notification_read      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION clear_all_notifications     FROM PUBLIC;

-- 授予 authenticated
GRANT EXECUTE ON FUNCTION set_password              TO authenticated;
GRANT EXECUTE ON FUNCTION change_username            TO authenticated;
GRANT EXECUTE ON FUNCTION update_comment_status      TO authenticated;
GRANT EXECUTE ON FUNCTION delete_comment             TO authenticated;
GRANT EXECUTE ON FUNCTION add_comment                TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_comments            TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_page_comments       TO authenticated;
GRANT EXECUTE ON FUNCTION get_notifications           TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_count            TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_read      TO authenticated;
GRANT EXECUTE ON FUNCTION clear_all_notifications     TO authenticated;

-- ============================================================
-- 12. 收紧 RLS 策略 — 替换 "Anyone can read wiki_users"
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read wiki_users" ON wiki_users;

-- 用户可读自己的记录；admin/super_admin 可读所有
CREATE POLICY "Users read own or admin read all" ON wiki_users FOR SELECT
  USING (
    id = auth.uid()
    OR auth.uid() IN (
      SELECT id FROM wiki_users WHERE role IN ('admin', 'super_admin')
    )
  );

COMMIT;
