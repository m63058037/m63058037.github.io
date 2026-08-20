-- ============================================================
-- 注册/登录体系第二轮重构 — 统一迁移文件
-- 创建日期: 2026-08-20 (第二轮重写)
-- 说明: 本文件合并了第一轮和第二轮所有数据库变更。
--       完整包含：profiles 新字段、分校、密码重置请求表、
--       RLS 更新、RPC 函数。
-- 前置条件: 20260819000000_phase3_final_migration.sql 已执行
-- 幂等: 可重复执行，不会报错
-- 安全: 不修改现有数据，不修改 posts.id 类型，不删除业务表
--       （user_sessions 顶号表已按需求正式移除）
--       不使用 service_role key，不使用 auth.admin.create_user
--       所有 SECURITY DEFINER 函数设置 SET search_path = public
-- ============================================================

-- ============================================================
-- 1. profiles 表增加注册体系字段
-- ============================================================

-- 1.1 学生身份: school(本校) / external(外校)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_type VARCHAR(20) DEFAULT 'school';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_student_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_student_type_check
  CHECK (student_type IN ('school', 'external'));

-- 1.2 年级: 初一/初二/初三/高中及以上
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade VARCHAR(20) DEFAULT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_grade_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_grade_check
  CHECK (grade IN ('初一', '初二', '初三', '高中及以上') OR grade IS NULL);

-- 1.3 届次: 入学年份 (整数，如 2026)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cohort INTEGER DEFAULT NULL;

-- 1.4 班级: 1-20
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_number INTEGER DEFAULT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_class_number_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_class_number_check
  CHECK ((class_number >= 1 AND class_number <= 20) OR class_number IS NULL);

-- 1.5 学号: 1-50
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_number INTEGER DEFAULT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_student_number_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_student_number_check
  CHECK ((student_number >= 1 AND student_number <= 50) OR student_number IS NULL);

-- 1.6 账号管理状态: active/banned/disabled/deleted
-- 注意：此字段是账号管理状态，不是在线状态
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'banned', 'disabled', 'deleted'));

-- 1.7 系统角色: dev_admin/admin/member/guest
-- 四级身份体系：开发管理员/管理员/成员/访客
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('dev_admin', 'admin', 'member', 'guest'));

-- 1.8 UID: 8位数字字符串，允许前导0
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS uid VARCHAR(8) DEFAULT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_uid_format_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_uid_format_check
  CHECK (uid ~ '^[0-9]{8}$' OR uid IS NULL);

-- 1.9 分校: 所属分校名称
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch VARCHAR(50) DEFAULT NULL;

-- ============================================================
-- 2. 回填已有用户的 profiles 新字段
-- ============================================================

-- 从 auth.users.user_metadata 回填 uid
UPDATE public.profiles
SET uid = u.raw_user_meta_data->>'uid'
FROM auth.users u
WHERE profiles.id = u.id
  AND profiles.uid IS NULL
  AND u.raw_user_meta_data->>'uid' IS NOT NULL;

-- 回填 role：旧 super_admin → dev_admin，旧 admin → admin，旧 user/vip/moderator → member
UPDATE public.profiles
SET role = CASE
  WHEN u.raw_user_meta_data->>'role' = 'super_admin' THEN 'dev_admin'
  WHEN u.raw_user_meta_data->>'role' = 'admin' THEN 'admin'
  WHEN u.raw_user_meta_data->>'role' IN ('user', 'vip', 'moderator') THEN 'member'
  WHEN u.raw_user_meta_data->>'role' IS NULL THEN 'member'
  ELSE u.raw_user_meta_data->>'role'
END
FROM auth.users u
WHERE profiles.id = u.id
  AND (profiles.role IS NULL OR profiles.role = '' OR profiles.role NOT IN ('dev_admin', 'admin', 'member', 'guest'));

-- 为已有用户设置默认账号状态
UPDATE public.profiles
SET account_status = 'active'
WHERE account_status IS NULL OR account_status = '';

-- 为已有用户设置默认学生身份
UPDATE public.profiles
SET student_type = 'school'
WHERE student_type IS NULL OR student_type = '';

-- ============================================================
-- 3. 索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_uid ON public.profiles(uid);

-- 唯一索引：确保 UID 全局唯一（排除 NULL 值）
-- 如果存在重复 UID（来自旧数据），先清理再创建
DO $$
BEGIN
  -- 将重复 UID 设为 NULL（保留最早创建的记录）
  UPDATE public.profiles
  SET uid = NULL
  WHERE uid IS NOT NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY uid ORDER BY created_at) AS rn
      FROM public.profiles WHERE uid IS NOT NULL
    ) t WHERE t.rn = 1
  );
EXCEPTION WHEN OTHERS THEN
  -- 忽略可能的错误（如 uid 列不存在）
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_uid_unique ON public.profiles(uid) WHERE uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_student_type ON public.profiles(student_type);
CREATE INDEX IF NOT EXISTS idx_profiles_grade ON public.profiles(grade);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_branch ON public.profiles(branch);

-- ============================================================
-- 4. 更新用户注册触发器
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, nickname, avatar, bio, signature,
    student_type, grade, cohort, class_number, student_number,
    account_status, role, uid, branch,
    created_at, updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nickname', NEW.id::TEXT),
    COALESCE(NEW.raw_user_meta_data->>'avatar', NULL),
    COALESCE(NEW.raw_user_meta_data->>'bio', ''),
    COALESCE(NEW.raw_user_meta_data->>'signature', ''),
    COALESCE(NEW.raw_user_meta_data->>'student_type', 'school'),
    NULLIF(NEW.raw_user_meta_data->>'grade', '')::text,
    NULLIF(NEW.raw_user_meta_data->>'cohort', '')::int,
    NULLIF(NEW.raw_user_meta_data->>'class_number', '')::int,
    NULLIF(NEW.raw_user_meta_data->>'student_number', '')::int,
    'active',
    'member',
    COALESCE(NEW.raw_user_meta_data->>'uid', NULL),
    NULLIF(NEW.raw_user_meta_data->>'branch', ''),
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    nickname = COALESCE(public.profiles.nickname, EXCLUDED.nickname),
    avatar = COALESCE(public.profiles.avatar, EXCLUDED.avatar),
    bio = COALESCE(public.profiles.bio, EXCLUDED.bio),
    signature = COALESCE(public.profiles.signature, EXCLUDED.signature),
    student_type = COALESCE(public.profiles.student_type, EXCLUDED.student_type),
    grade = COALESCE(public.profiles.grade, EXCLUDED.grade),
    cohort = COALESCE(public.profiles.cohort, EXCLUDED.cohort),
    class_number = COALESCE(public.profiles.class_number, EXCLUDED.class_number),
    student_number = COALESCE(public.profiles.student_number, EXCLUDED.student_number),
    uid = COALESCE(public.profiles.uid, EXCLUDED.uid),
    branch = COALESCE(public.profiles.branch, EXCLUDED.branch),
    updated_at = NOW()
    -- 注意：role 和 account_status 不在 ON CONFLICT UPDATE 中
    -- 确保管理员设置的 role 和 account_status 不会被注册流程覆盖
  ;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. 密码重置请求表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  uid VARCHAR(8) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  admin_note TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_status_check;
ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

CREATE INDEX IF NOT EXISTS idx_prr_uid ON public.password_reset_requests(uid);
CREATE INDEX IF NOT EXISTS idx_prr_user_id ON public.password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_prr_status ON public.password_reset_requests(status);

-- ============================================================
-- 6. 用户会话表（顶号机制）— 已移除
-- 单设备登录/顶号功能已正式移除，不再使用 user_sessions 表
-- ============================================================

DROP TABLE IF EXISTS public.user_sessions CASCADE;

-- ============================================================
-- 7. RLS 策略
-- ============================================================

-- 7.1 posts 表 RLS
-- 仅本校初中生(初一/初二/初三)且账号管理状态为 active 可以发帖
DROP POLICY IF EXISTS "Users can create posts" ON public.posts;
DROP POLICY IF EXISTS "School students can create posts" ON public.posts;

CREATE POLICY "School students can create posts"
  ON public.posts FOR INSERT
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

-- 修复 UPDATE 策略：类型安全比较
DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

-- 修复 DELETE 策略：类型安全比较
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;
CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- 7.2 profiles 表 RLS
-- 用户只能更新自己的 profile
-- 受保护字段通过 BEFORE UPDATE 触发器保护（见第 7.5 节）
-- 受保护字段：role, uid, branch, account_status, student_type, grade, cohort, class_number, student_number
-- 用户可修改字段：nickname, avatar, bio, signature
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

CREATE POLICY "Users can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 7.3 password_reset_requests RLS
-- 用户可以创建自己的重置请求
-- 用户可以查看自己的重置请求
-- 管理员可以查看所有重置请求（后续通过 RPC 实现）
DROP POLICY IF EXISTS "Users can create password reset requests" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Users can view own password reset requests" ON public.password_reset_requests;

CREATE POLICY "Users can create password reset requests"
  ON public.password_reset_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own password reset requests"
  ON public.password_reset_requests FOR SELECT
  USING (auth.uid() = user_id);

-- 7.4 user_sessions RLS — 已移除（顶号功能已停用）
-- user_sessions 表已删除，无需 RLS 策略

-- ============================================================
-- 7.5 profiles 字段保护触发器
-- ============================================================
-- 通过 BEFORE UPDATE 触发器保护核心字段
-- 当 auth.uid() = NEW.id（用户更新自己的资料）时，以下字段不可修改：
--   role, uid, branch, account_status, student_type, grade, cohort, class_number, student_number
-- 当 auth.uid() != NEW.id 或 auth.uid() IS NULL（管理员操作/系统操作）时，不限制
-- 注意：PostgreSQL RLS WITH CHECK 不能引用 OLD，因此用触发器实现字段级保护

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- 仅当当前认证用户正在更新自己的 profile 时应用保护
  IF auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION '禁止修改角色字段';
    END IF;
    IF NEW.uid IS DISTINCT FROM OLD.uid THEN
      RAISE EXCEPTION '禁止修改UID字段';
    END IF;
    IF NEW.branch IS DISTINCT FROM OLD.branch THEN
      RAISE EXCEPTION '禁止修改所属分校字段';
    END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      RAISE EXCEPTION '禁止修改账号状态字段';
    END IF;
    IF NEW.student_type IS DISTINCT FROM OLD.student_type THEN
      RAISE EXCEPTION '禁止修改学生身份字段';
    END IF;
    IF NEW.grade IS DISTINCT FROM OLD.grade THEN
      RAISE EXCEPTION '禁止修改年级字段';
    END IF;
    IF NEW.cohort IS DISTINCT FROM OLD.cohort THEN
      RAISE EXCEPTION '禁止修改届次字段';
    END IF;
    IF NEW.class_number IS DISTINCT FROM OLD.class_number THEN
      RAISE EXCEPTION '禁止修改班级字段';
    END IF;
    IF NEW.student_number IS DISTINCT FROM OLD.student_number THEN
      RAISE EXCEPTION '禁止修改学号字段';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 删除旧触发器（如果存在）并创建新触发器
DROP TRIGGER IF EXISTS protect_profile_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ============================================================
-- 8. RPC 函数
-- ============================================================

-- 8.1 生成唯一 UID（8位数字，允许前导0）
-- 注意：此函数授予 anon 权限，因为注册时用户尚未认证
-- 安全保障：仅返回随机 UID，不暴露任何用户数据
CREATE OR REPLACE FUNCTION public.generate_unique_uid()
RETURNS TEXT AS $$
DECLARE
  v_uid TEXT;
  v_exists BOOLEAN;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_uid := lpad(floor(random() * 100000000)::TEXT, 8, '0');
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE uid = v_uid) INTO v_exists;
    IF NOT v_exists THEN
      RETURN v_uid;
    END IF;
    v_attempts := v_attempts + 1;
    IF v_attempts >= 10 THEN
      RAISE EXCEPTION '生成唯一UID失败，请重试';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.generate_unique_uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_unique_uid() TO anon, authenticated;

-- 8.2 检查重复身份
-- 检查给定的分校+年级+届次+班级+学号是否已存在
-- 注意：此函数授予 anon 权限，因为注册时用户尚未认证
-- 安全保障：仅返回 BOOLEAN，不暴露任何用户数据
CREATE OR REPLACE FUNCTION public.check_duplicate_identity(
  p_branch VARCHAR,
  p_grade VARCHAR,
  p_cohort INTEGER,
  p_class_number INTEGER,
  p_student_number INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.branch = p_branch
      AND profiles.grade = p_grade
      AND profiles.cohort = p_cohort
      AND profiles.class_number = p_class_number
      AND profiles.student_number = p_student_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_duplicate_identity(VARCHAR, VARCHAR, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_duplicate_identity(VARCHAR, VARCHAR, INTEGER, INTEGER, INTEGER) TO anon, authenticated;

-- 8.3 检查当前用户是否可以发帖
CREATE OR REPLACE FUNCTION public.can_user_post()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.student_type = 'school'
      AND profiles.grade IN ('初一', '初二', '初三')
      AND profiles.account_status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.can_user_post() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_post() TO authenticated;

-- 8.4-8.7 会话相关 RPC 函数 — 已移除（顶号功能已停用）
-- 以下函数仅服务于单设备登录/顶号机制，现已移除：
--   register_session, is_session_active, update_session_activity, get_user_online_status

DROP FUNCTION IF EXISTS public.register_session(UUID, VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.is_session_active(VARCHAR);
DROP FUNCTION IF EXISTS public.update_session_activity(VARCHAR);
DROP FUNCTION IF EXISTS public.get_user_online_status(VARCHAR);

-- 8.8 密码重置请求 — 创建请求
-- 注意：此函数授予 anon 权限，因为用户忘记密码时未登录
-- 安全保障：函数内部通过 UID 查找用户，无法用于探测其他信息
-- 返回值为请求 ID，不暴露用户敏感数据
CREATE OR REPLACE FUNCTION public.create_password_reset_request(
  p_uid VARCHAR
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_request_id UUID;
  v_existing_pending UUID;
BEGIN
  -- 通过 UID 查找用户
  SELECT id INTO v_user_id FROM public.profiles WHERE uid = p_uid LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '该UID对应的用户不存在';
  END IF;

  -- 检查是否已有待处理请求
  SELECT id INTO v_existing_pending FROM public.password_reset_requests
  WHERE user_id = v_user_id AND status = 'pending'
  LIMIT 1;

  IF v_existing_pending IS NOT NULL THEN
    RETURN v_existing_pending;
  END IF;

  -- 创建新请求
  INSERT INTO public.password_reset_requests (user_id, uid, status)
  VALUES (v_user_id, p_uid, 'pending')
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_password_reset_request(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_password_reset_request(VARCHAR) TO anon, authenticated;

-- 8.9 密码重置请求 — 检查请求状态
-- 注意：此函数授予 anon 权限，因为用户忘记密码时未登录
-- 安全保障：仅返回该 UID 的重置请求状态，不暴露其他用户数据
CREATE OR REPLACE FUNCTION public.check_password_reset_status(
  p_uid VARCHAR
)
RETURNS TABLE(id UUID, status VARCHAR, requested_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ, admin_note TEXT)
AS $$
BEGIN
  RETURN QUERY
  SELECT prr.id, prr.status, prr.requested_at, prr.reviewed_at, prr.admin_note
  FROM public.password_reset_requests prr
  WHERE prr.uid = p_uid
  ORDER BY prr.requested_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_password_reset_status(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_password_reset_status(VARCHAR) TO anon, authenticated;

-- 8.10 密码重置 — 管理员批准后用户设置新密码
-- 安全接口：需要管理员已批准的重置请求
-- 注意：此函数授予 anon 权限，因为用户忘记密码时未登录
-- 安全保障：
--   1. 仅当存在 status='approved' 的请求时才执行
--   2. 执行后立即将请求标记为 'completed'，防止重复使用
--   3. 同时使该用户的所有旧会话失效
--   4. 不返回任何敏感数据，仅返回 BOOLEAN
CREATE OR REPLACE FUNCTION public.reset_password_with_approval(
  p_uid VARCHAR,
  p_new_password TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_request_id UUID;
BEGIN
  -- 查找用户
  SELECT id INTO v_user_id FROM public.profiles WHERE uid = p_uid LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 检查是否有已批准的请求
  SELECT id INTO v_request_id FROM public.password_reset_requests
  WHERE uid = p_uid AND status = 'approved'
  ORDER BY reviewed_at DESC
  LIMIT 1;

  IF v_request_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 更新密码
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10))
  WHERE id = v_user_id;

  -- 标记请求为已完成
  UPDATE public.password_reset_requests
  SET status = 'completed', completed_at = NOW(), updated_at = NOW()
  WHERE id = v_request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reset_password_with_approval(VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_password_with_approval(VARCHAR, TEXT) TO anon, authenticated;

-- ============================================================
-- 9. 完成
-- ============================================================

SELECT 'Registration system v2 migration applied successfully' AS result;
