-- ============================================================
-- 第四阶段修复：忘记密码审核 / 数据总览 RPC 幂等重建
-- 创建日期: 2026-08-24
-- 目的: 修复数据库中可能部署的旧版本 RPC（早于 08-21 字段修订），
--       它们仍引用 password_reset_requests 上已不存在的
--       full_name / branch / reason 列，导致 HTTP 400
--       "column ... does not exist"（COLUMN REFERENCES 类报错）。
-- 说明: 与 20260820000002_phase4_community.sql 中已验证的字段一致
--       profiles: nickname(非 name), branch, account_status
--       password_reset_requests: user_id, uid, status, handler_id,
--         handled_at, handle_note, temp_password, created_at (无 full_name/branch/reason)
-- 幂等: CREATE OR REPLACE 可重复执行，不会报错
-- 安全: SECURITY DEFINER 均 SET search_path = public；
--       仅 admin/dev_admin 可调用；不改动表结构与权限体系
-- ============================================================

-- 1. 数据总览 RPC（表格式数组返回，前端已适配取首行）
DROP FUNCTION IF EXISTS public.admin_get_dashboard_stats();
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS TABLE (
  pending_password_resets INTEGER,
  pending_reports INTEGER,
  total_users INTEGER,
  total_posts INTEGER,
  unread_admin_notifications INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role VARCHAR;
  v_pending_pr INTEGER;
  v_pending_reports INTEGER;
  v_total_users INTEGER;
  v_total_posts INTEGER;
  v_unread_notifs INTEGER;
BEGIN
  v_role := public.get_user_role(v_user_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COUNT(*) INTO v_pending_pr FROM public.password_reset_requests WHERE status = 'pending';
  SELECT COUNT(*) INTO v_pending_reports FROM public.reports WHERE status = 'pending';
  SELECT COUNT(*) INTO v_total_users FROM public.profiles WHERE account_status = 'active';
  SELECT COUNT(*) INTO v_total_posts FROM public.posts WHERE is_deleted = FALSE;

  SELECT COUNT(*) INTO v_unread_notifs
  FROM public.admin_notifications an
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_notification_reads anr
    WHERE anr.notification_id = an.id AND anr.admin_id = v_user_id
  );

  RETURN QUERY SELECT v_pending_pr, v_pending_reports, v_total_users, v_total_posts, v_unread_notifs;
END;
$$;

-- 2. 忘记密码审核列表 RPC（JOIN profiles 取用户信息，不再引用不存在的列）
DROP FUNCTION IF EXISTS public.admin_get_password_resets(varchar, integer, integer);
CREATE OR REPLACE FUNCTION public.admin_get_password_resets(
  p_status VARCHAR DEFAULT 'pending',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  student_id VARCHAR,
  full_name VARCHAR,
  branch VARCHAR,
  reason TEXT,
  status VARCHAR,
  handler_id UUID,
  handled_at TIMESTAMP WITH TIME ZONE,
  handle_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role VARCHAR;
  v_offset INTEGER := (p_page - 1) * p_page_size;
  v_total INTEGER;
BEGIN
  v_role := public.get_user_role(v_user_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.password_reset_requests prr WHERE prr.status = p_status;

  RETURN QUERY
  SELECT
    prr.id,
    prr.user_id,
    prr.uid as student_id,
    pr.nickname as full_name,
    pr.branch,
    NULL::text as reason,
    prr.status,
    prr.handler_id,
    prr.handled_at,
    prr.handle_note,
    prr.created_at,
    v_total
  FROM public.password_reset_requests prr
  LEFT JOIN public.profiles pr ON prr.user_id = pr.id
  WHERE prr.status = p_status
  ORDER BY prr.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- 3. 通过申请 RPC
DROP FUNCTION IF EXISTS public.admin_approve_password_reset(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_approve_password_reset(
  p_request_id UUID,
  p_temp_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
  v_user_id UUID;
  v_user_name VARCHAR;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_temp_password IS NULL OR length(p_temp_password) < 6 THEN
    RAISE EXCEPTION 'Temp password too short';
  END IF;

  UPDATE public.password_reset_requests
  SET status = 'approved',
      handler_id = v_admin_id,
      handled_at = NOW(),
      temp_password = crypt(p_temp_password, gen_salt('bf'))
  WHERE id = p_request_id AND status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already handled';
  END IF;

  SELECT nickname INTO v_user_name FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.system_messages (user_id, message_type, title, content, target_type, target_id)
  VALUES (
    v_user_id,
    'password_reset_approved',
    '密码重置申请已通过',
    '你的密码重置申请已通过审核。临时密码为：' || p_temp_password || '，请登录后尽快修改密码。',
    'password_reset_request',
    p_request_id::text
  );

  RETURN TRUE;
END;
$$;

-- 4. 驳回申请 RPC
DROP FUNCTION IF EXISTS public.admin_reject_password_reset(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_reject_password_reset(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
  v_user_id UUID;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.password_reset_requests
  SET status = 'rejected',
      handler_id = v_admin_id,
      handled_at = NOW(),
      handle_note = p_reason
  WHERE id = p_request_id AND status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already handled';
  END IF;

  INSERT INTO public.system_messages (user_id, message_type, title, content, target_type, target_id)
  VALUES (
    v_user_id,
    'password_reset_rejected',
    '密码重置申请未通过',
    '你的密码重置申请未通过。原因：' || COALESCE(p_reason, '未说明原因') || '。如有疑问请联系管理员。',
    'password_reset_request',
    p_request_id::text
  );

  RETURN TRUE;
END;
$$;