-- ============================================================================
-- shsg8c1wiki 许愿池积分支付 v13
-- 在 Supabase SQL Editor 运行，或通过 _scripts/run_sql.mjs
-- ============================================================================
-- 改动：
--   1. points_transactions 的 reason CHECK 增加 'wish_payment'
--   2. wishes 表增加 points_paid 列
--   3. 新增 RPC: pay_wish_with_points — 积分支付服务费
--   4. 更新 get_all_wishes / get_wish_by_id 返回 points_paid
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. points_transactions — 增加 'wish_payment' reason
-- ============================================================
ALTER TABLE points_transactions DROP CONSTRAINT IF EXISTS points_transactions_reason_check;
ALTER TABLE points_transactions ADD CONSTRAINT points_transactions_reason_check
  CHECK (reason IN ('checkin','comment','forum_post','plaza_article','wish_done','purchase','wish_payment'));

-- ============================================================
-- 2. wishes 表 — 增加 points_paid 列（记录积分支付金额）
-- ============================================================
ALTER TABLE wishes ADD COLUMN IF NOT EXISTS points_paid integer NOT NULL DEFAULT 0;

-- ============================================================
-- 3. NEW RPC: pay_wish_with_points — 用积分支付服务费
--    积分兑换率：1 RMB = 200 积分
--    仅支持支付服务费（首付），不支持月费
-- ============================================================
CREATE OR REPLACE FUNCTION pay_wish_with_points(p_wish_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_wish_user_id  uuid;
  v_status        text;
  v_tier          text;
  v_points_needed integer;
  v_total_points  integer;
  v_points_paid   integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '请先登录');
  END IF;

  -- 获取许愿信息
  SELECT w.user_id, w.status, w.estimated_tier, w.points_paid
  INTO v_wish_user_id, v_status, v_tier, v_points_paid
  FROM wishes w
  WHERE w.id = p_wish_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '需求不存在');
  END IF;

  -- 只能由许愿者本人支付
  IF v_wish_user_id IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', '只能为自己的需求付款');
  END IF;

  -- 检查状态
  IF v_status != 'pending_payment' THEN
    RETURN jsonb_build_object('success', false, 'message', '该需求不需要付款或已付款');
  END IF;

  -- 已积分支付过则跳过
  IF v_points_paid > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '已使用积分支付');
  END IF;

  -- 根据档位计算所需积分（1 RMB = 200 积分）
  v_points_needed := CASE v_tier
    WHEN 'small'  THEN 100   -- ¥0.5 × 200
    WHEN 'medium' THEN 600   -- ¥3   × 200
    WHEN 'large'  THEN 2000  -- ¥10  × 200
    ELSE 0
  END;

  IF v_points_needed <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '无效的档位');
  END IF;

  -- 检查积分余额
  SELECT total_points INTO v_total_points FROM wiki_users WHERE id = v_user_id;
  IF v_total_points < v_points_needed THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '积分不足，需要 ' || v_points_needed || ' 积分（你目前有 ' || v_total_points || ' 积分）'
    );
  END IF;

  -- 扣积分
  UPDATE wiki_users
  SET total_points = total_points - v_points_needed,
      updated_at = now()
  WHERE id = v_user_id;

  -- 记录积分流水（负值 = 支出）
  INSERT INTO points_transactions (user_id, amount, reason, reference_id)
  VALUES (v_user_id, -v_points_needed, 'wish_payment', p_wish_id);

  -- 更新许愿状态
  UPDATE wishes
  SET status = 'paid',
      paid_at = now(),
      updated_at = now(),
      points_paid = v_points_needed
  WHERE id = p_wish_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '支付成功！扣除 ' || v_points_needed || ' 积分'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pay_wish_with_points TO PUBLIC;

-- ============================================================
-- 4. 更新 get_all_wishes / get_wish_by_id 返回 points_paid
-- ============================================================

DROP FUNCTION IF EXISTS get_wish_by_id(uuid);

CREATE OR REPLACE FUNCTION get_wish_by_id(p_id uuid)
RETURNS TABLE(
  id uuid,
  request_number int,
  description text,
  title text,
  content text,
  contact_type text,
  contact_detail text,
  model_preference text,
  extra_money int,
  api_budget_cap int,
  estimated_tier text,
  user_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  paid_at timestamptz,
  estimated_hours text,
  estimated_stage text,
  points_paid int,
  author_username text,
  author_name text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    w.id, w.request_number, w.description, w.title, w.content,
    w.contact_type, w.contact_detail, w.model_preference,
    w.extra_money, w.api_budget_cap, w.estimated_tier,
    w.user_id, w.status, w.created_at, w.updated_at,
    w.paid_at, w.estimated_hours, w.estimated_stage,
    w.points_paid,
    u.username AS author_username,
    u.name AS author_name
  FROM wishes w
  LEFT JOIN wiki_users u ON w.user_id = u.id
  WHERE w.id = p_id;
$$;

DROP FUNCTION IF EXISTS get_all_wishes(text);

CREATE OR REPLACE FUNCTION get_all_wishes(
  p_tier text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  request_number int,
  description text,
  title text,
  content text,
  contact_type text,
  contact_detail text,
  model_preference text,
  extra_money int,
  api_budget_cap int,
  estimated_tier text,
  user_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  paid_at timestamptz,
  estimated_hours text,
  estimated_stage text,
  points_paid int,
  author_username text,
  author_name text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    w.id, w.request_number, w.description, w.title, w.content,
    w.contact_type, w.contact_detail, w.model_preference,
    w.extra_money, w.api_budget_cap, w.estimated_tier,
    w.user_id, w.status, w.created_at, w.updated_at,
    w.paid_at, w.estimated_hours, w.estimated_stage,
    w.points_paid,
    u.username AS author_username,
    u.name AS author_name
  FROM wishes w
  LEFT JOIN wiki_users u ON w.user_id = u.id
  WHERE (p_tier IS NULL OR w.estimated_tier = p_tier)
  ORDER BY
    CASE w.status
      WHEN 'done' THEN 2
      WHEN 'cancelled' THEN 3
      ELSE 1
    END,
    w.extra_money DESC,
    w.created_at DESC;
$$;

COMMIT;
