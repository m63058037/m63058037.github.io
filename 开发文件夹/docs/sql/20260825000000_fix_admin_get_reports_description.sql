-- ============================================================
-- 幂等修复：admin_get_reports 举报说明字段
-- 根因：数据库实际部署的 RPC 可能未将 reports.content 别名成 description，
--       而管理员前端读取的是 item.description，导致「举报说明」显示为空。
-- 本脚本将函数重建为统一返回 description（内部读 reports.content，真实列名）。
-- 安全：SECURITY DEFINER + search_path = public，仅 admin/dev_admin 可执行；
--       仅修改该 RPC，不动 Schema / RLS / 权限体系。
-- 幂等：先 DROP IF EXISTS 匹配函数签名，再重新创建，可安全重复执行。
-- 注意：此脚本不自动执行，需人工在 Supabase SQL 中手动运行。
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_get_reports(
  p_status VARCHAR,
  p_page INTEGER,
  p_page_size INTEGER
);

CREATE OR REPLACE FUNCTION public.admin_get_reports(
  p_status VARCHAR DEFAULT 'pending',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  reporter_id UUID,
  reporter_name VARCHAR,
  target_type VARCHAR,
  target_id VARCHAR,
  report_type VARCHAR,
  description TEXT,
  status VARCHAR,
  handler_id UUID,
  handle_result TEXT,
  handled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
  v_offset INTEGER := (p_page - 1) * p_page_size;
  v_total INTEGER;
  v_filter_status VARCHAR;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- 前端发送 'handled'，映射为数据库中的 'resolved'
  v_filter_status := CASE WHEN p_status = 'handled' THEN 'resolved' ELSE p_status END;

  SELECT COUNT(*) INTO v_total FROM public.reports r WHERE r.status = v_filter_status;

  RETURN QUERY
  SELECT
    r.id,
    r.reporter_id,
    p.nickname as reporter_name,
    r.target_type,
    r.target_id,
    r.report_type,
    r.content as description,
    CASE WHEN r.status = 'resolved' THEN 'handled' ELSE r.status END as status,
    r.handler_id,
    r.handle_result,
    r.handled_at,
    r.created_at,
    v_total
  FROM public.reports r
  LEFT JOIN public.profiles p ON r.reporter_id = p.id
  WHERE r.status = v_filter_status
  ORDER BY r.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;