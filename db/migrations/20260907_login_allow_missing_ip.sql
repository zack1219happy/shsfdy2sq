-- 客户端无法获取公网 IP 时，继续使用账号密码完成登录。
CREATE OR REPLACE FUNCTION public.login(p_name_or_username text, p_password text, p_client_ip text DEFAULT NULL::text)
 RETURNS TABLE(
   id uuid,
   name text,
   username text,
   student_id text,
   has_password boolean,
   banned_until timestamp with time zone,
   role text,
   login_status text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec wiki_users%ROWTYPE;
  v_client_ip inet;
  v_valid_password boolean := false;
BEGIN
  BEGIN
    IF NULLIF(btrim(p_client_ip), '') IS NOT NULL THEN
      v_client_ip := btrim(p_client_ip)::inet;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_client_ip := NULL;
  END;

  SELECT * INTO v_rec
  FROM wiki_users wu
  WHERE wu.name = p_name_or_username OR wu.username = p_name_or_username
  LIMIT 1;

  IF FOUND THEN
    IF v_rec.banned_until IS NOT NULL AND v_rec.banned_until > now() THEN
      RETURN QUERY
      SELECT v_rec.id, v_rec.name, v_rec.username,
             v_rec.student_id, NULL::boolean, v_rec.banned_until,
             v_rec.role, 'banned'::text;
      RETURN;
    END IF;

    IF v_client_ip IS NOT NULL AND EXISTS (
      SELECT 1 FROM wiki_ip_allowlist WHERE ip = v_client_ip
    ) AND NOT EXISTS (
      SELECT 1 FROM wiki_ip_allowlist
      WHERE ip = v_client_ip AND user_id = v_rec.id
    ) THEN
      RETURN;
    END IF;

    IF v_rec.password_hash IS NOT NULL THEN
      v_valid_password := encode(extensions.digest(p_password, 'sha256'), 'hex') = v_rec.password_hash;
    ELSE
      v_valid_password := p_password = v_rec.student_id;
    END IF;
  END IF;

  IF v_valid_password THEN
    RETURN QUERY
    SELECT v_rec.id, v_rec.name, v_rec.username,
           v_rec.student_id, (v_rec.password_hash IS NOT NULL), NULL::timestamptz,
           v_rec.role, 'success'::text;
    RETURN;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.login(text, text, text) IS '登录验证（返回用户信息和登录状态）';
