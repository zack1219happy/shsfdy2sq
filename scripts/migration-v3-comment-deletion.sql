-- ============================================================================
-- Conditional comment deletion
-- Run this migration after migration-v2 in the Supabase SQL Editor.
--
-- Leaf comments are removed. Comments with children remain as deleted
-- placeholders, and empty deleted ancestors are cleaned up afterwards.
-- ============================================================================

BEGIN;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

ALTER TABLE forum_comments
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.delete_comment(p_comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_uid UUID;
  v_caller_role text;
  v_parent_id UUID;
  v_next_parent_id UUID;
  v_is_deleted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  SELECT role INTO v_caller_role FROM wiki_users WHERE id = auth.uid();
  SELECT user_id, parent_id, deleted
  INTO v_author_uid, v_parent_id, v_is_deleted
  FROM comments
  WHERE id = p_comment_id;

  IF NOT FOUND OR v_is_deleted THEN
    RETURN FALSE;
  END IF;

  IF v_caller_role = 'super_admin' THEN
    NULL;
  ELSIF v_caller_role = 'admin' THEN
    IF v_author_uid IS NOT NULL
       AND EXISTS (SELECT 1 FROM wiki_users WHERE id = v_author_uid AND role = 'super_admin')
    THEN
      RETURN FALSE;
    END IF;
  ELSIF v_author_uid <> auth.uid() OR v_author_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (SELECT 1 FROM comments WHERE parent_id = p_comment_id) THEN
    UPDATE comments SET deleted = TRUE, content = '' WHERE id = p_comment_id;
    RETURN TRUE;
  END IF;

  DELETE FROM comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_next_parent_id := v_parent_id;
  WHILE v_next_parent_id IS NOT NULL LOOP
    DELETE FROM comments AS parent
    WHERE parent.id = v_next_parent_id
      AND parent.deleted = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM comments AS child WHERE child.parent_id = parent.id
      )
    RETURNING parent.parent_id INTO v_next_parent_id;

    IF NOT FOUND THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_forum_comment(p_comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_uid UUID;
  v_caller_role text;
  v_parent_id UUID;
  v_next_parent_id UUID;
  v_is_deleted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  SELECT role INTO v_caller_role FROM wiki_users WHERE id = auth.uid();
  SELECT author_id, parent_id, deleted
  INTO v_author_uid, v_parent_id, v_is_deleted
  FROM forum_comments
  WHERE id = p_comment_id;

  IF NOT FOUND OR v_is_deleted THEN
    RETURN FALSE;
  END IF;

  IF v_caller_role = 'super_admin' THEN
    NULL;
  ELSIF v_caller_role = 'admin' THEN
    IF v_author_uid IS NOT NULL
       AND EXISTS (SELECT 1 FROM wiki_users WHERE id = v_author_uid AND role = 'super_admin')
    THEN
      RETURN FALSE;
    END IF;
  ELSIF v_author_uid <> auth.uid() OR v_author_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (SELECT 1 FROM forum_comments WHERE parent_id = p_comment_id) THEN
    UPDATE forum_comments SET deleted = TRUE, content = '' WHERE id = p_comment_id;
    RETURN TRUE;
  END IF;

  DELETE FROM forum_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_next_parent_id := v_parent_id;
  WHILE v_next_parent_id IS NOT NULL LOOP
    DELETE FROM forum_comments AS parent
    WHERE parent.id = v_next_parent_id
      AND parent.deleted = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM forum_comments AS child WHERE child.parent_id = parent.id
      )
    RETURNING parent.parent_id INTO v_next_parent_id;

    IF NOT FOUND THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_comment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_forum_comment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_comment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_forum_comment(uuid) TO authenticated;

COMMIT;
