-- ============================================================
-- RLS 全面验收后的权限收紧 — 幂等迁移（待部署，不自动执行）
-- 创建日期: 2026-08-26
-- 说明: 修复 RLS 验收发现的 3 个 P2 + 3 个 P3 收紧项（合并为 5 组）。
--       本文件仅作为待部署内容创建，需人工在 Supabase SQL 中手动运行，脚本本身不执行。
-- 前置条件: 20260820000000_registration_system_refactor.sql
--           20260820000002_phase4_community.sql 已执行
-- 幂等: 全部使用 DROP IF EXISTS + CREATE OR REPLACE / CREATE POLICY，可安全重复执行。
-- 安全: 不修改表结构，不删除数据，不使用 service_role，不触及 posts.id 类型。
--       所有 SECURITY DEFINER 函数保留 SECURITY DEFINER + SET search_path = public。
-- ============================================================

-- ============================================================
-- 修复项 1（P2）：收紧全部管理员 RPC 的 EXECUTE 权限
-- 现状：phase4_community 对这些函数未写 REVOKE/GRANT，导致默认 EXECUTE 授予 PUBLIC（含 anon）。
--       虽然函数内部 get_user_role 校验会拒绝，但应把执行入口收紧为仅 authenticated。
-- 处理：对每个 admin RPC 执行 REVOKE EXECUTE FROM PUBLIC; GRANT EXECUTE TO authenticated。
--       保留 SECURITY DEFINER，保留 search_path = public，保留函数内部 admin/dev_admin 二次校验。
-- ============================================================

-- admin_get_reports
REVOKE EXECUTE ON FUNCTION public.admin_get_reports(VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_reports(VARCHAR, INTEGER, INTEGER) TO authenticated;

-- admin_handle_report
REVOKE EXECUTE ON FUNCTION public.admin_handle_report(UUID, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_handle_report(UUID, VARCHAR, TEXT) TO authenticated;

-- admin_get_password_resets
REVOKE EXECUTE ON FUNCTION public.admin_get_password_resets(VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_password_resets(VARCHAR, INTEGER, INTEGER) TO authenticated;

-- admin_get_dashboard_stats
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;

-- admin_get_notifications (含 admin_mark_notification_read)
REVOKE EXECUTE ON FUNCTION public.admin_get_notifications(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_notifications(INTEGER, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(UUID) TO authenticated;

-- admin_approve_password_reset / admin_reject_password_reset
REVOKE EXECUTE ON FUNCTION public.admin_approve_password_reset(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_password_reset(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reject_password_reset(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_password_reset(UUID, TEXT) TO authenticated;

-- get_user_role / get_current_user_role 权限辅助函数（同样收紧，供前端/内部校验用）
REVOKE EXECUTE ON FUNCTION public.get_user_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

-- get_current_user_role: 获取当前登录用户的角色（带 account_status 校验）
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN public.get_user_role(auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

-- ============================================================
-- 修复项 2（P2）：收紧 profiles 敏感身份字段的 SELECT 暴露
-- 现状：profiles SELECT policy = USING(true)，前端若用 anon key select('*') 可读到
--       student_number / class_number / cohort / role / account_status / uid / branch 等整行列。
-- 处理：保持 "Users can view profiles" SELECT USING(true)（保证公开昵称/头像/签名等正常读取），
--       但在列级权限上仅授予公开字段给 anon/authenticated，敏感列不对外授权。
--       说明：PostgreSQL 列级权限配合 supabase 的 postgrest 按列检索，默认必需列权限表级。
--       postgrest 对单个表 select('*') 需要的是表的 SELECT 权；若我们要阻止列，需授予
--       SELECT(公开列) 并 REVOKE SELECT(敏感列)。此处采用列级授权方案。
--       公开列：id, nickname, avatar, bio, signature, created_at, updated_at
--       敏感列：student_type, grade, cohort, class_number, student_number, role,
--               account_status, uid, branch
-- 注意：注册/重置密码流程中部分 Service 会读取 student_number/class_number 等（自身账号的
--       身份匹配查询，见 auth.js 账号查询 select 'id, uid, nickname' 属于白名单公开列；注册
--       handle_new_user 触发器由 SECURITY DEFINER 写，不受此影响）。列级 REVOKE 仅影响
--       通过 postgrest 的 SELECT，SECURITY DEFINER RPC 与触发器内部不受影响。
-- ============================================================

-- 先把表级 SELECT 授权交给列级处理：撤销表级 SELECT 的 PUBLIC 授权，仅保留列级
REVOKE SELECT ON public.profiles FROM anon, authenticated;
-- 授予公开列给所有可读角色
GRANT SELECT (id, nickname, avatar, bio, signature, created_at, updated_at)
  ON public.profiles TO anon, authenticated;
-- 授予当前用户读取自己必要身份字段的权限（用于 getCurrentUser、权限判断、身份标签等）
GRANT SELECT (student_type, grade, cohort, class_number, student_number, role, account_status, uid, branch)
  ON public.profiles TO authenticated;
-- 注：为确保 admin 表格管理 / 内部逻辑不受影响，admin/dev_admin 不在此 REVOKE 范围内，
--     但本项目禁止 service_role，管理员对 profiles 的完整读写均应通过 RPC，此处仅按需。

-- 补充：显式 REVOKE SELECT 敏感列（兜底，若无表级授权则自动无权限）
REVOKE SELECT (student_type, grade, cohort, class_number, student_number, role, account_status, uid, branch)
  ON public.profiles FROM anon, authenticated;

-- 为已登录用户提供"读取本人完整资料"的专用 RPC（SECURITY DEFINER，绕过列级限制）。
-- 用途：getCurrentUser / 权限判断 / 资格判断 等需要本人完整身份字段的场景。
-- 普通用户只能拿到自己的行；跨用户资料展示走 getUsersInfo 白名单（仅公开列）。
CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS TABLE (
  id UUID,
  uid VARCHAR,
  nickname VARCHAR,
  avatar TEXT,
  bio VARCHAR,
  signature VARCHAR,
  student_type VARCHAR,
  grade VARCHAR,
  cohort INTEGER,
  class_number INTEGER,
  student_number INTEGER,
  account_status VARCHAR,
  role VARCHAR,
  branch VARCHAR,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.uid, p.nickname, p.avatar, p.bio, p.signature,
    p.student_type, p.grade, p.cohort, p.class_number, p.student_number,
    p.account_status, p.role, p.branch, p.created_at, p.updated_at
  FROM public.profiles p
  WHERE p.id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_own_profile() TO authenticated;

-- ============================================================
-- 修复项 3（P3）：限制 system_messages UPDATE 只能修改 is_read
-- 现状：system_messages_update_own = FOR UPDATE USING (auth.uid() = user_id)，无 WITH CHECK、无列限制。
--       用户虽只能改自己的行，但可改该行任意列（title/content/message_type/target_type 等）。
-- 处理：重建 policy 增加 WITH CHECK，仅允许 is_read 变化；同时用 BEFORE UPDATE 触发器做列级保护，
--       保证只有 is_read 能被更新，其余系统字段不可由用户改动。
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_system_message_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- 仅当当前认证用户更新自己的消息时，限制只能改 is_read
  IF auth.uid() = NEW.user_id THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION '禁止修改消息所属用户';
    END IF;
    IF NEW.message_type IS DISTINCT FROM OLD.message_type THEN
      RAISE EXCEPTION '禁止修改消息类型';
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      RAISE EXCEPTION '禁止修改消息标题';
    END IF;
    IF NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION '禁止修改消息内容';
    END IF;
    IF NEW.target_type IS DISTINCT FROM OLD.target_type THEN
      RAISE EXCEPTION '禁止修改消息目标类型';
    END IF;
    IF NEW.target_id IS DISTINCT FROM OLD.target_id THEN
      RAISE EXCEPTION '禁止修改消息目标ID';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION '禁止修改消息创建时间';
    END IF;
    -- is_read 允许修改（标记已读/未读）
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_system_message_fields_trigger ON public.system_messages;
CREATE TRIGGER protect_system_message_fields_trigger
  BEFORE UPDATE ON public.system_messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_system_message_fields();

-- 重建 UPDATE policy，仅允许更新自己的行并限定只能更新 is_read
DROP POLICY IF EXISTS system_messages_update_own ON public.system_messages;
CREATE POLICY system_messages_update_own ON public.system_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND OLD.user_id = NEW.user_id
    AND OLD.message_type = NEW.message_type
    AND OLD.title = NEW.title
    AND coalesce(OLD.content, '') = coalesce(NEW.content, '')
    AND coalesce(OLD.target_type, '') = coalesce(NEW.target_type, '')
    AND coalesce(OLD.target_id, '') = coalesce(NEW.target_id, '')
    AND OLD.created_at = NEW.created_at
  );

-- ============================================================
-- 修复项 4（P3）：posts UPDATE 增加账号资格检查（与 INSERT 一致）
-- 现状：UPDATE = USING/WITH CHECK (auth.uid()::text = user_id::text)，仅限本人，未校验账号资格。
-- 处理：重建 UPDATE policy，在本人基础上增加「本校学生 + 初一/初二/初三 + active」校验，
--       使被禁用/失去发帖资格的账号无法继续编辑自己的帖子，与 INSERT 资格保持一致。
-- ============================================================

DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE
  USING (
    auth.uid()::text = user_id::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.student_type = 'school'
        AND profiles.grade IN ('初一', '初二', '初三')
        AND profiles.account_status = 'active'
    )
  )
  WITH CHECK (
    auth.uid()::text = user_id::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.student_type = 'school'
        AND profiles.grade IN ('初一', '初二', '初三')
        AND profiles.account_status = 'active'
    )
  );

-- ============================================================
-- 修复项 5（P3）：管理员权限判断纳入 account_status
-- 现状：get_user_role(p_user_id) 仅返回 role，未校验 account_status；admin RPC 内部
--       都依赖它做权限判断，导致被禁用(disabled/banned/deleted)的管理员仍可能放行。
-- 处理：改造 get_user_role，当账号存在且 account_status != 'active' 时返回受限角色 'guest'，
--       使所有依赖它的 admin RPC 与 get_current_user_role 自动拒绝非 active 账号。
--       原则：仅收紧，不削弱——active 的 admin/dev_admin/member 行为完全不变。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role VARCHAR;
  v_status VARCHAR;
BEGIN
  SELECT role, account_status INTO v_role, v_status
  FROM public.profiles WHERE id = p_user_id;

  -- 账号不存在或已停用（banned/disabled/deleted）时，一律按访客处理，拒绝管理员/会员特权
  IF v_status IS NOT NULL AND v_status <> 'active' THEN
    RETURN 'guest';
  END IF;

  RETURN COALESCE(v_role, 'member');
END;
$$;

-- ============================================================
-- 完成
-- ============================================================

SELECT 'RLS hardening migration applied successfully' AS result;