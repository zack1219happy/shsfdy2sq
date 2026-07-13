-- ============================================================================
-- shsg8c1wiki 私信功能数据库迁移
-- 在 Supabase SQL Editor 或通过 Management API 运行
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. conversations — 显式对话表
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id        uuid NOT NULL REFERENCES wiki_users(id) ON DELETE CASCADE,
  user2_id        uuid NOT NULL REFERENCES wiki_users(id) ON DELETE CASCADE,
  last_message    text,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_conversation UNIQUE (user1_id, user2_id),
  CONSTRAINT ck_user_order CHECK (user1_id < user2_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_user1 ON conversations(user1_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_user2 ON conversations(user2_id, last_message_at DESC);

-- ============================================================
-- 2. private_messages — 消息表
-- ============================================================
CREATE TABLE IF NOT EXISTS private_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES wiki_users(id) ON DELETE CASCADE,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  recalled_at     timestamptz,          -- null = 未撤回, 非 null = 撤回时间
  sender_deleted  boolean NOT NULL DEFAULT false,
  recipient_deleted boolean NOT NULL DEFAULT false,
  participants      uuid[]               -- Realtime RLS 需要冗余存储参与者
);

CREATE INDEX IF NOT EXISTS idx_pm_conv ON private_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pm_sender ON private_messages(sender_id, created_at);

-- ============================================================
-- 2.5 conversation_read_status — 记录用户最后阅读对话的时间
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_read_status (
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES wiki_users(id) ON DELETE CASCADE,
  read_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- ============================================================
-- 2.6 conversation_active_sessions — 实时在线追踪
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_active_sessions (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES wiki_users(id) ON DELETE CASCADE,
  heartbeat_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cas_heartbeat ON conversation_active_sessions(heartbeat_at);

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_active_sessions ENABLE ROW LEVEL SECURITY;

-- Realtime 需要表级 SELECT 权限才能广播变更
GRANT SELECT ON private_messages TO anon, authenticated;

-- conversations: 只看到自己参与的
DROP POLICY IF EXISTS conv_select ON conversations;
CREATE POLICY conv_select ON conversations
  FOR SELECT USING (auth.uid() IN (user1_id, user2_id));

DROP POLICY IF EXISTS conv_insert ON conversations;
CREATE POLICY conv_insert ON conversations
  FOR INSERT WITH CHECK (auth.uid() IN (user1_id, user2_id));

-- private_messages
DROP POLICY IF EXISTS pm_select ON private_messages;
CREATE POLICY pm_select ON private_messages
  FOR SELECT USING (
    auth.uid() = sender_id
    OR auth.uid() = ANY(participants)
  );

DROP POLICY IF EXISTS pm_insert ON private_messages;
CREATE POLICY pm_insert ON private_messages
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  ));

DROP POLICY IF EXISTS pm_update ON private_messages;
CREATE POLICY pm_update ON private_messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- conversation_read_status
DROP POLICY IF EXISTS crs_select ON conversation_read_status;
CREATE POLICY crs_select ON conversation_read_status
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS crs_insert ON conversation_read_status;
CREATE POLICY crs_insert ON conversation_read_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS crs_update ON conversation_read_status;
CREATE POLICY crs_update ON conversation_read_status
  FOR UPDATE USING (auth.uid() = user_id);

-- conversation_active_sessions
DROP POLICY IF EXISTS cas_select ON conversation_active_sessions;
CREATE POLICY cas_select ON conversation_active_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cas_insert ON conversation_active_sessions;
CREATE POLICY cas_insert ON conversation_active_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  ));

DROP POLICY IF EXISTS cas_update ON conversation_active_sessions;
CREATE POLICY cas_update ON conversation_active_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cas_delete ON conversation_active_sessions;
CREATE POLICY cas_delete ON conversation_active_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. RPC: get_or_create_conversation
-- ============================================================
CREATE OR REPLACE FUNCTION get_or_create_conversation(p_other_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
  v_conv_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_uid = p_other_user_id THEN RAISE EXCEPTION 'Cannot message yourself'; END IF;

  -- 检查对方是否在 get_all_users 中（排除 test/admin_wz 等）
  IF NOT EXISTS (SELECT 1 FROM get_all_users() WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION 'Cannot message this user';
  END IF;

  SELECT id INTO v_conv_id FROM conversations
  WHERE (user1_id = least(v_uid, p_other_user_id) AND user2_id = greatest(v_uid, p_other_user_id));

  IF v_conv_id IS NULL THEN
    INSERT INTO conversations (user1_id, user2_id)
    VALUES (least(v_uid, p_other_user_id), greatest(v_uid, p_other_user_id))
    RETURNING id INTO v_conv_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

-- ============================================================
-- 4.5 RPC: heartbeat_conversation — 活跃心跳（每 10s 调用）
--       同时清理超过 30 秒的心跳
-- ============================================================
CREATE OR REPLACE FUNCTION heartbeat_conversation(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO conversation_active_sessions (conversation_id, user_id, heartbeat_at)
  VALUES (p_conversation_id, auth.uid(), now())
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET heartbeat_at = now();

  -- 清理过期心跳
  DELETE FROM conversation_active_sessions WHERE heartbeat_at < now() - interval '30 seconds';
END;
$$;

-- ============================================================
-- 4.6 RPC: leave_conversation — 离开对话时清理心跳
-- ============================================================
CREATE OR REPLACE FUNCTION leave_conversation(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM conversation_active_sessions
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$$;

-- ============================================================
-- 5. RPC: send_message
-- ============================================================
CREATE OR REPLACE FUNCTION send_message(p_other_user_id uuid, p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
  v_conv_id uuid;
  v_msg_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_content IS NULL OR trim(p_content) = '' THEN RAISE EXCEPTION 'Content cannot be empty'; END IF;

  v_conv_id := get_or_create_conversation(p_other_user_id);

  INSERT INTO private_messages (conversation_id, sender_id, content, participants)
  VALUES (v_conv_id, v_uid, p_content, ARRAY[v_uid, p_other_user_id])
  RETURNING id INTO v_msg_id;

  -- 更新对话预览
  UPDATE conversations SET
    last_message = left(p_content, 100),
    last_message_at = now()
  WHERE id = v_conv_id;

  -- 通知统一由接收端 Realtime 事件驱动，DM 不走 notifications 表

  RETURN v_msg_id;
END;
$$;

-- ============================================================
-- 6. RPC: get_conversations
-- ============================================================
CREATE OR REPLACE FUNCTION get_conversations()
RETURNS TABLE(
  conversation_id uuid,
  other_user_id   uuid,
  other_username  text,
  other_name      text,
  last_message    text,
  last_message_at timestamptz,
  unread_count    bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    CASE WHEN c.user1_id = v_uid THEN c.user2_id ELSE c.user1_id END AS other_user_id,
    w.username AS other_username,
    w.name AS other_name,
    CASE WHEN c.last_message IS NOT NULL THEN
      CASE WHEN c.last_message = '【消息已撤回】' THEN '【消息已撤回】'
        ELSE c.last_message
      END
    ELSE NULL END AS last_message,
    c.last_message_at,
    CASE WHEN EXISTS (
      SELECT 1 FROM conversation_active_sessions cas
      WHERE cas.conversation_id = c.id AND cas.user_id = v_uid
        AND cas.heartbeat_at > now() - interval '15 seconds'
    ) THEN 0
    ELSE (
      SELECT count(*) FROM private_messages pm
      WHERE pm.conversation_id = c.id
        AND pm.sender_id != v_uid
        AND pm.recalled_at IS NULL
        AND (
          CASE WHEN c.user1_id = v_uid THEN pm.recipient_deleted ELSE pm.sender_deleted END
        ) = false
        AND pm.created_at > coalesce(
          (SELECT read_at FROM conversation_read_status crs WHERE crs.conversation_id = c.id AND crs.user_id = v_uid),
          '1970-01-01'::timestamptz
        )
    ) END
  FROM conversations c
  JOIN wiki_users w ON w.id = CASE WHEN c.user1_id = v_uid THEN c.user2_id ELSE c.user1_id END
  WHERE c.user1_id = v_uid OR c.user2_id = v_uid
  ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$;

-- ============================================================
-- 7. RPC: get_messages
-- ============================================================
CREATE OR REPLACE FUNCTION get_messages(p_conversation_id uuid, p_limit int DEFAULT 50, p_before timestamptz DEFAULT NULL)
RETURNS TABLE(
  id           uuid,
  sender_id    uuid,
  sender_username text,
  content      text,
  created_at   timestamptz,
  recalled_at  timestamptz,
  is_mine      boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  -- 检查权限
  IF NOT EXISTS (SELECT 1 FROM conversations WHERE id = p_conversation_id AND (user1_id = v_uid OR user2_id = v_uid)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    pm.id, pm.sender_id, w.username,
    CASE WHEN pm.recalled_at IS NOT NULL THEN '【消息已撤回】' ELSE pm.content END AS content,
    pm.created_at, pm.recalled_at,
    pm.sender_id = v_uid AS is_mine
  FROM private_messages pm
  JOIN wiki_users w ON w.id = pm.sender_id
  WHERE pm.conversation_id = p_conversation_id
    AND ((pm.sender_id = v_uid AND pm.sender_deleted = false) OR (pm.sender_id != v_uid AND pm.recipient_deleted = false))
    AND (p_before IS NULL OR pm.created_at < p_before)
  ORDER BY pm.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================
-- 8. RPC: recall_message (2 分钟窗口)
-- ============================================================
CREATE OR REPLACE FUNCTION recall_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
  v_sender uuid;
  v_created timestamptz;
  v_conv_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT sender_id, created_at, conversation_id INTO v_sender, v_created, v_conv_id
  FROM private_messages WHERE id = p_message_id;

  IF v_sender IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;
  IF v_sender != v_uid THEN RAISE EXCEPTION 'Can only recall your own messages'; END IF;
  IF v_created + interval '2 minutes' < now() THEN RAISE EXCEPTION 'Recall window expired'; END IF;
  IF EXISTS (SELECT 1 FROM private_messages WHERE id = p_message_id AND recalled_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Message already recalled';
  END IF;

  UPDATE private_messages SET recalled_at = now() WHERE id = p_message_id;

  -- 更新对话预览（仅当撤回的是最后一条消息时）
  IF EXISTS (
    SELECT 1 FROM private_messages pm
    WHERE pm.conversation_id = v_conv_id
      AND pm.id = p_message_id
      AND pm.created_at = (SELECT max(created_at) FROM private_messages WHERE conversation_id = v_conv_id)
  ) THEN
    UPDATE conversations SET last_message = '【消息已撤回】' WHERE id = v_conv_id;
  END IF;
END;
$$;

-- ============================================================
-- 9. RPC: get_unread_dm_count
-- ============================================================
CREATE OR REPLACE FUNCTION get_unread_dm_count()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  RETURN (
    SELECT count(*) FROM private_messages pm
    JOIN conversations c ON c.id = pm.conversation_id
    WHERE (c.user1_id = v_uid OR c.user2_id = v_uid)
      AND pm.sender_id != v_uid
      AND pm.recalled_at IS NULL
      AND NOT (CASE WHEN c.user1_id = v_uid THEN pm.recipient_deleted ELSE pm.sender_deleted END)
      AND pm.created_at > coalesce(
        (SELECT read_at FROM conversation_read_status crs WHERE crs.conversation_id = c.id AND crs.user_id = v_uid),
        '1970-01-01'::timestamptz
      )
      AND NOT EXISTS (
        SELECT 1 FROM conversation_active_sessions cas
        WHERE cas.conversation_id = c.id AND cas.user_id = v_uid
          AND cas.heartbeat_at > now() - interval '15 seconds'
      )
  );
END;
$$;

-- ============================================================
-- 10. RPC: mark_conversation_read
-- ============================================================
CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO conversation_read_status (conversation_id, user_id, read_at)
  VALUES (p_conversation_id, auth.uid(), now())
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET read_at = now();
END;
$$;

COMMIT;
