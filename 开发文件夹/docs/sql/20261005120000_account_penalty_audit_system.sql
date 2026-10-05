-- ============================================================
-- 管理员处罚、账户封禁与审计系统 V1.0 — 阶段 1（库结构 / RLS / RPC）
-- 创建日期: 2026-10-05
-- 前置: 20260820000000 / 20260820000002 / 20260824000000 / 20260826000000 / 20260829000000
-- 幂等: IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE
-- 安全: 无 service_role；RLS 默认拒绝直表；SECURITY DEFINER + get_user_role 二次校验
--       不修改 posts.id / posts.user_id 类型；不盲改历史 banned 行
-- 语义: account_status='banned' AND ban_until IS NULL = 永久封禁（含历史数据）
--       banned AND ban_until > now() = 临时封禁仍有效
--       banned AND ban_until <= now() = 已到期（读路径视为可用，不在 STABLE 权限函数里写库）
-- ============================================================

-- ============================================================
-- 1. profiles.ban_until（不改 CHECK 枚举，不 UPDATE 历史 banned）
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ban_until TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.profiles.ban_until IS
  '临时封禁到期时刻；NULL 且 account_status=banned 表示永久封禁。到期后读路径视为可用，写回 active 走独立恢复函数。';

-- 用户不能自己改 ban_until（与 role/account_status 同等保护）
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
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
    IF NEW.ban_until IS DISTINCT FROM OLD.ban_until THEN
      RAISE EXCEPTION '禁止修改封禁到期字段';
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

-- ============================================================
-- 2. 审计 / 处罚 / FDI 表（无 anon/authenticated 直表策略）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(64) NOT NULL,
  actor_id UUID,
  actor_uid VARCHAR(8),
  actor_role VARCHAR(20),
  target_id UUID,
  target_uid VARCHAR(8),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_uid ON public.admin_audit_logs (target_uid);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_uid ON public.admin_audit_logs (actor_uid);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_logs FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.account_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  target_uid VARCHAR(8) NOT NULL,
  actor_user_id UUID,
  actor_uid VARCHAR(8),
  actor_role VARCHAR(20),
  penalty_type VARCHAR(32) NOT NULL
    CHECK (penalty_type IN ('temporary', 'permanent', 'lift_temporary', 'lift_permanent')),
  duration_code VARCHAR(8),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'admin'
    CHECK (source IN ('admin', 'sensitive_l4', 'system')),
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_fdi VARCHAR(12),
  lifted_at TIMESTAMPTZ,
  lifted_by UUID,
  lift_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_penalties_target ON public.account_penalties (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_penalties_type ON public.account_penalties (penalty_type);

ALTER TABLE public.account_penalties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_penalties FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.account_penalty_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  penalty_id UUID NOT NULL REFERENCES public.account_penalties(id),
  post_id VARCHAR NOT NULL,
  title TEXT,
  excerpt TEXT,
  author_user_id VARCHAR,
  author_uid VARCHAR(8),
  posted_at TIMESTAMPTZ,
  was_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_penalty_posts_penalty ON public.account_penalty_posts (penalty_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_penalty_posts_unique ON public.account_penalty_posts (penalty_id, post_id);

ALTER TABLE public.account_penalty_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_penalty_posts FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.forum_device_ids (
  fdi VARCHAR(12) PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.forum_device_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forum_device_ids FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.penalty_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  penalty_id UUID NOT NULL REFERENCES public.account_penalties(id),
  fdi VARCHAR(12) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (penalty_id, fdi)
);
ALTER TABLE public.penalty_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.penalty_devices FROM PUBLIC, anon, authenticated;

ALTER TABLE public.password_reset_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- 3. 不可变审计 / 处罚证据
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs are immutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_audit_logs_no_update ON public.admin_audit_logs;
CREATE TRIGGER trg_admin_audit_logs_no_update
  BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

DROP TRIGGER IF EXISTS trg_admin_audit_logs_no_delete ON public.admin_audit_logs;
CREATE TRIGGER trg_admin_audit_logs_no_delete
  BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

DROP TRIGGER IF EXISTS trg_admin_audit_logs_no_truncate ON public.admin_audit_logs;
CREATE TRIGGER trg_admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON public.admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_immutable();

CREATE OR REPLACE FUNCTION public.penalty_posts_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'account_penalty_posts are immutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_penalty_posts_no_update ON public.account_penalty_posts;
CREATE TRIGGER trg_penalty_posts_no_update
  BEFORE UPDATE ON public.account_penalty_posts
  FOR EACH ROW EXECUTE FUNCTION public.penalty_posts_immutable();

DROP TRIGGER IF EXISTS trg_penalty_posts_no_delete ON public.account_penalty_posts;
CREATE TRIGGER trg_penalty_posts_no_delete
  BEFORE DELETE ON public.account_penalty_posts
  FOR EACH ROW EXECUTE FUNCTION public.penalty_posts_immutable();

CREATE OR REPLACE FUNCTION public.account_penalties_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'account_penalties cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
     OR NEW.target_uid IS DISTINCT FROM OLD.target_uid
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.penalty_type IS DISTINCT FROM OLD.penalty_type
     OR NEW.duration_code IS DISTINCT FROM OLD.duration_code
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.actor_uid IS DISTINCT FROM OLD.actor_uid
     OR NEW.actor_role IS DISTINCT FROM OLD.actor_role
     OR NEW.evidence_json IS DISTINCT FROM OLD.evidence_json
     OR NEW.related_fdi IS DISTINCT FROM OLD.related_fdi THEN
    RAISE EXCEPTION 'account_penalties are immutable except lift fields' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_penalties_guard ON public.account_penalties;
CREATE TRIGGER trg_account_penalties_guard
  BEFORE UPDATE OR DELETE ON public.account_penalties
  FOR EACH ROW EXECUTE FUNCTION public.account_penalties_guard();

DROP TRIGGER IF EXISTS trg_account_penalties_no_truncate ON public.account_penalties;
CREATE TRIGGER trg_account_penalties_no_truncate
  BEFORE TRUNCATE ON public.account_penalties
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_immutable();

DROP TRIGGER IF EXISTS trg_penalty_posts_no_truncate ON public.account_penalty_posts;
CREATE TRIGGER trg_penalty_posts_no_truncate
  BEFORE TRUNCATE ON public.account_penalty_posts
  FOR EACH STATEMENT EXECUTE FUNCTION public.penalty_posts_immutable();

-- ============================================================
-- 4. 纯读判断（无写库）+ 独立恢复（可写）
-- ============================================================
CREATE OR REPLACE FUNCTION public.account_ban_is_active(
  p_status VARCHAR,
  p_ban_until TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT p_status = 'banned'
     AND (p_ban_until IS NULL OR p_ban_until > NOW());
$$;

CREATE OR REPLACE FUNCTION public.account_is_usable_status(
  p_status VARCHAR,
  p_ban_until TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT p_status NOT IN ('disabled', 'deleted')
     AND NOT public.account_ban_is_active(p_status, p_ban_until);
$$;

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
  v_until TIMESTAMPTZ;
BEGIN
  SELECT role, account_status, ban_until INTO v_role, v_status, v_until
  FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'guest';
  END IF;

  IF NOT public.account_is_usable_status(v_status, v_until) THEN
    RETURN 'guest';
  END IF;

  RETURN COALESCE(v_role, 'member');
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_account_is_usable()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_status VARCHAR;
  v_until TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT account_status, ban_until INTO v_status, v_until
  FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  RETURN public.account_is_usable_status(v_status, v_until);
END;
$$;

CREATE OR REPLACE FUNCTION public.penalty_restore_expired_ban(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid VARCHAR(8);
  v_updated BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  -- 仅本人或当前有效 admin/dev_admin 可触发写回；永久封禁/disabled/deleted 因 WHERE 不会被更新
  IF auth.uid() IS DISTINCT FROM p_user_id
     AND public.get_user_role(auth.uid()) NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET account_status = 'active',
         ban_until = NULL,
         updated_at = NOW()
   WHERE id = p_user_id
     AND account_status = 'banned'
     AND ban_until IS NOT NULL
     AND ban_until <= NOW();

  IF FOUND THEN
    v_updated := TRUE;
    SELECT uid INTO v_uid FROM public.profiles WHERE id = p_user_id;
    INSERT INTO public.admin_audit_logs (action, actor_id, actor_uid, actor_role, target_id, target_uid, payload)
    VALUES (
      'expired_ban_restored',
      p_user_id,
      v_uid,
      'system',
      p_user_id,
      v_uid,
      jsonb_build_object('mechanism', 'independent_restore')
    );
  END IF;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_own_expired_ban()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.penalty_restore_expired_ban(auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.can_user_post()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND student_type = 'school'
      AND grade IN ('初一', '初二', '初三')
      AND public.account_is_usable_status(account_status, ban_until)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fdi_is_valid(p_fdi TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_fdi IS NOT NULL AND p_fdi ~ '^[A-Za-z0-9]{12}$';
$$;

CREATE OR REPLACE FUNCTION public.penalty_duration_interval(p_code VARCHAR)
RETURNS INTERVAL
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_code
    WHEN '1h' THEN RETURN INTERVAL '1 hour';
    WHEN '3h' THEN RETURN INTERVAL '3 hours';
    WHEN '1d' THEN RETURN INTERVAL '1 day';
    WHEN '3d' THEN RETURN INTERVAL '3 days';
    WHEN '7d' THEN RETURN INTERVAL '7 days';
    WHEN '1m' THEN RETURN INTERVAL '1 month';
    ELSE RAISE EXCEPTION 'invalid duration_code' USING ERRCODE = '22023';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.penalty_usable_dev_admin_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.profiles p
  WHERE p.role = 'dev_admin'
    AND public.account_is_usable_status(p.account_status, p.ban_until);
$$;

CREATE OR REPLACE FUNCTION public.penalty_write_audit(
  p_action VARCHAR,
  p_actor_id UUID,
  p_actor_uid VARCHAR,
  p_actor_role VARCHAR,
  p_target_id UUID,
  p_target_uid VARCHAR,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_audit_logs (
    action, actor_id, actor_uid, actor_role, target_id, target_uid, payload
  ) VALUES (
    p_action, p_actor_id, p_actor_uid, p_actor_role, p_target_id, p_target_uid,
    COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

-- ============================================================
-- 5. 封禁核心（唯一状态机）
-- ============================================================
CREATE OR REPLACE FUNCTION public.penalty_apply_core(
  p_actor_id UUID,
  p_target_id UUID,
  p_type VARCHAR,
  p_duration_code VARCHAR,
  p_reason TEXT,
  p_post_ids VARCHAR[],
  p_fdi VARCHAR,
  p_source VARCHAR,
  p_evidence JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role_raw VARCHAR;
  v_actor_uid VARCHAR(8);
  v_actor_effective VARCHAR;
  v_target_role VARCHAR;
  v_target_uid VARCHAR(8);
  v_target_status VARCHAR;
  v_target_until TIMESTAMPTZ;
  v_starts TIMESTAMPTZ;
  v_ends TIMESTAMPTZ;
  v_penalty_id UUID;
  v_post_id VARCHAR;
  v_title TEXT;
  v_excerpt TEXT;
  v_author VARCHAR;
  v_author_uid VARCHAR(8);
  v_posted TIMESTAMPTZ;
  v_deleted BOOLEAN;
  v_found BOOLEAN;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF p_type NOT IN ('temporary', 'permanent') THEN
    RAISE EXCEPTION 'invalid penalty type' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('admin', 'sensitive_l4') THEN
    RAISE EXCEPTION 'invalid source' USING ERRCODE = '22023';
  END IF;

  SELECT role, uid INTO v_actor_role_raw, v_actor_uid
  FROM public.profiles WHERE id = p_actor_id;
  v_actor_effective := public.get_user_role(p_actor_id);

  SELECT role, uid, account_status, ban_until
    INTO v_target_role, v_target_uid, v_target_status, v_target_until
  FROM public.profiles WHERE id = p_target_id FOR UPDATE;

  IF v_target_uid IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_role = 'dev_admin' THEN
    PERFORM 1 FROM public.profiles WHERE role = 'dev_admin' FOR UPDATE;
  END IF;

  PERFORM public.penalty_restore_expired_ban(p_target_id);

  SELECT role, uid, account_status, ban_until
    INTO v_target_role, v_target_uid, v_target_status, v_target_until
  FROM public.profiles WHERE id = p_target_id;

  IF v_actor_effective NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id = p_target_id THEN
    RAISE EXCEPTION 'cannot punish self' USING ERRCODE = '42501';
  END IF;

  IF v_actor_effective = 'admin' THEN
    IF v_target_role IN ('admin', 'dev_admin') THEN
      RAISE EXCEPTION 'admin cannot punish admin' USING ERRCODE = '42501';
    END IF;
    IF p_type = 'permanent' THEN
      RAISE EXCEPTION 'admin cannot permanently ban' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_target_role = 'dev_admin'
     AND public.account_is_usable_status(v_target_status, v_target_until)
     AND public.penalty_usable_dev_admin_count() <= 1 THEN
    RAISE EXCEPTION 'cannot punish last usable dev_admin' USING ERRCODE = '42501';
  END IF;

  IF public.account_ban_is_active(v_target_status, v_target_until) AND v_target_until IS NULL THEN
    RAISE EXCEPTION 'account already permanently banned' USING ERRCODE = 'P0001';
  END IF;

  IF p_type = 'temporary' THEN
    IF p_duration_code IS NULL THEN
      RAISE EXCEPTION 'duration required' USING ERRCODE = '22023';
    END IF;
    IF v_target_until IS NOT NULL AND v_target_until > NOW()
       AND public.account_ban_is_active(v_target_status, v_target_until) THEN
      v_starts := v_target_until;
    ELSE
      v_starts := NOW();
    END IF;
    v_ends := v_starts + public.penalty_duration_interval(p_duration_code);
  ELSE
    v_starts := NOW();
    v_ends := NULL;
  END IF;

  IF p_source = 'admin' THEN
    IF p_post_ids IS NULL OR cardinality(p_post_ids) < 1 THEN
      RAISE EXCEPTION 'at least one post required' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_fdi IS NOT NULL AND length(p_fdi) > 0 AND NOT public.fdi_is_valid(p_fdi) THEN
    RAISE EXCEPTION 'invalid fdi' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.account_penalties (
    target_user_id, target_uid, actor_user_id, actor_uid, actor_role,
    penalty_type, duration_code, starts_at, ends_at, reason, source,
    evidence_json, related_fdi
  ) VALUES (
    p_target_id, v_target_uid, p_actor_id, v_actor_uid, v_actor_effective,
    p_type, p_duration_code, v_starts, v_ends, trim(p_reason), p_source,
    COALESCE(p_evidence, '{}'::jsonb),
    CASE WHEN public.fdi_is_valid(p_fdi) THEN p_fdi ELSE NULL END
  ) RETURNING id INTO v_penalty_id;

  IF p_post_ids IS NOT NULL THEN
    FOREACH v_post_id IN ARRAY p_post_ids LOOP
      v_found := FALSE;
      v_title := NULL;
      v_excerpt := NULL;
      v_author := NULL;
      v_author_uid := NULL;
      v_posted := NULL;
      v_deleted := FALSE;

      SELECT TRUE, p.title, left(p.content, 500), p.user_id, pr.uid, p.created_at, p.is_deleted
        INTO v_found, v_title, v_excerpt, v_author, v_author_uid, v_posted, v_deleted
      FROM public.posts p
      LEFT JOIN public.profiles pr ON pr.id::text = p.user_id::text
      WHERE p.id::text = v_post_id::text
      LIMIT 1;

      IF v_found IS DISTINCT FROM TRUE THEN
        IF p_source = 'sensitive_l4' THEN
          INSERT INTO public.account_penalty_posts (
            penalty_id, post_id, title, excerpt, was_deleted
          ) VALUES (
            v_penalty_id, v_post_id, NULL, NULL, TRUE
          )
          ON CONFLICT (penalty_id, post_id) DO NOTHING;
          CONTINUE;
        END IF;
        RAISE EXCEPTION 'post not found: %', v_post_id USING ERRCODE = 'P0002';
      END IF;

      INSERT INTO public.account_penalty_posts (
        penalty_id, post_id, title, excerpt, author_user_id, author_uid, posted_at, was_deleted
      ) VALUES (
        v_penalty_id, v_post_id, v_title, v_excerpt, v_author, v_author_uid, v_posted, COALESCE(v_deleted, FALSE)
      )
      ON CONFLICT (penalty_id, post_id) DO NOTHING;
    END LOOP;
  END IF;

  IF public.fdi_is_valid(p_fdi) THEN
    INSERT INTO public.forum_device_ids (fdi, first_seen_at, last_seen_at)
    VALUES (p_fdi, NOW(), NOW())
    ON CONFLICT (fdi) DO UPDATE SET last_seen_at = NOW();
    INSERT INTO public.penalty_devices (penalty_id, fdi) VALUES (v_penalty_id, p_fdi)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_type = 'permanent' THEN
    UPDATE public.profiles
       SET account_status = 'banned', ban_until = NULL, updated_at = NOW()
     WHERE id = p_target_id;
  ELSE
    UPDATE public.profiles
       SET account_status = 'banned', ban_until = v_ends, updated_at = NOW()
     WHERE id = p_target_id;
  END IF;

  PERFORM public.penalty_write_audit(
    CASE WHEN p_type = 'permanent' THEN 'permanent_ban' ELSE 'temporary_ban' END,
    p_actor_id, v_actor_uid, v_actor_effective, p_target_id, v_target_uid,
    jsonb_build_object(
      'penalty_id', v_penalty_id,
      'duration_code', p_duration_code,
      'starts_at', v_starts,
      'ends_at', v_ends,
      'source', p_source,
      'reason', trim(p_reason)
    )
  );

  RETURN v_penalty_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_penalty(
  p_target_uid VARCHAR,
  p_type VARCHAR,
  p_duration_code VARCHAR,
  p_reason TEXT,
  p_post_ids VARCHAR[],
  p_fdi VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_target FROM public.profiles WHERE uid = p_target_uid LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.penalty_apply_core(
    auth.uid(), v_target, p_type, p_duration_code, p_reason, p_post_ids, p_fdi, 'admin', '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.penalty_lift_core(
  p_target_uid VARCHAR,
  p_mode VARCHAR,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_eff VARCHAR;
  v_actor_uid VARCHAR(8);
  v_target UUID;
  v_target_uid VARCHAR(8);
  v_status VARCHAR;
  v_until TIMESTAMPTZ;
  v_role VARCHAR;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  v_actor_eff := public.get_user_role(v_actor);
  SELECT uid INTO v_actor_uid FROM public.profiles WHERE id = v_actor;

  SELECT id, uid, account_status, ban_until, role
    INTO v_target, v_target_uid, v_status, v_until, v_role
  FROM public.profiles WHERE uid = p_target_uid LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_mode = 'temporary' THEN
    IF v_actor_eff NOT IN ('admin', 'dev_admin') THEN
      RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;
    IF v_status = 'banned' AND v_until IS NULL THEN
      RAISE EXCEPTION 'admin cannot lift permanent ban' USING ERRCODE = '42501';
    END IF;
    IF NOT public.account_ban_is_active(v_status, v_until) THEN
      RAISE EXCEPTION 'no active temporary ban' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_mode = 'permanent' THEN
    IF v_actor_eff <> 'dev_admin' THEN
      RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;
    IF NOT (v_status = 'banned' AND v_until IS NULL) THEN
      RAISE EXCEPTION 'target is not permanently banned' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid lift mode' USING ERRCODE = '22023';
  END IF;

  UPDATE public.account_penalties
     SET lifted_at = NOW(), lifted_by = v_actor, lift_reason = trim(p_reason)
   WHERE target_user_id = v_target
     AND lifted_at IS NULL
     AND penalty_type IN ('temporary', 'permanent')
     AND (
       (p_mode = 'temporary' AND penalty_type = 'temporary')
       OR (p_mode = 'permanent' AND penalty_type = 'permanent')
     );

  INSERT INTO public.account_penalties (
    target_user_id, target_uid, actor_user_id, actor_uid, actor_role,
    penalty_type, starts_at, ends_at, reason, source
  ) VALUES (
    v_target, v_target_uid, v_actor, v_actor_uid, v_actor_eff,
    CASE WHEN p_mode = 'permanent' THEN 'lift_permanent' ELSE 'lift_temporary' END,
    NOW(), NOW(), trim(p_reason), 'admin'
  );

  UPDATE public.profiles
     SET account_status = 'active', ban_until = NULL, updated_at = NOW()
   WHERE id = v_target;

  PERFORM public.penalty_write_audit(
    CASE WHEN p_mode = 'permanent' THEN 'permanent_ban_restored' ELSE 'temporary_ban_lifted' END,
    v_actor, v_actor_uid, v_actor_eff, v_target, v_target_uid,
    jsonb_build_object('reason', trim(p_reason))
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_lift_temporary_ban(p_target_uid VARCHAR, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.penalty_lift_core(p_target_uid, 'temporary', p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_admin_lift_permanent_ban(p_target_uid VARCHAR, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.penalty_lift_core(p_target_uid, 'permanent', p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_admin_grant_admin(p_target_uid VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_uid VARCHAR(8);
  v_target UUID;
  v_target_uid VARCHAR(8);
  v_role VARCHAR;
BEGIN
  IF public.get_user_role(v_actor) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT id, uid, role INTO v_target, v_target_uid, v_role FROM public.profiles WHERE uid = p_target_uid;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target = v_actor THEN
    RAISE EXCEPTION 'cannot change own role' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'member' THEN
    RAISE EXCEPTION 'only member can be granted admin' USING ERRCODE = '42501';
  END IF;
  SELECT uid INTO v_actor_uid FROM public.profiles WHERE id = v_actor;
  UPDATE public.profiles SET role = 'admin', updated_at = NOW() WHERE id = v_target;
  PERFORM public.penalty_write_audit(
    'role_grant_admin', v_actor, v_actor_uid, 'dev_admin', v_target, v_target_uid,
    jsonb_build_object('from', 'member', 'to', 'admin')
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_admin_revoke_admin(p_target_uid VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_uid VARCHAR(8);
  v_target UUID;
  v_target_uid VARCHAR(8);
  v_role VARCHAR;
BEGIN
  IF public.get_user_role(v_actor) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT id, uid, role INTO v_target, v_target_uid, v_role FROM public.profiles WHERE uid = p_target_uid;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target = v_actor THEN
    RAISE EXCEPTION 'cannot change own role' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'only admin can be revoked to member' USING ERRCODE = '42501';
  END IF;
  SELECT uid INTO v_actor_uid FROM public.profiles WHERE id = v_actor;
  UPDATE public.profiles SET role = 'member', updated_at = NOW() WHERE id = v_target;
  PERFORM public.penalty_write_audit(
    'role_revoke_admin', v_actor, v_actor_uid, 'dev_admin', v_target, v_target_uid,
    jsonb_build_object('from', 'admin', 'to', 'member')
  );
  RETURN TRUE;
END;
$$;

-- ============================================================
-- 6. 查询 / 注册风控 / 登录 UID 检查
-- ============================================================
CREATE OR REPLACE FUNCTION public.uid_has_active_ban(p_uid VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_status VARCHAR;
  v_until TIMESTAMPTZ;
BEGIN
  SELECT account_status, ban_until INTO v_status, v_until
  FROM public.profiles WHERE uid = p_uid LIMIT 1;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  RETURN public.account_ban_is_active(v_status, v_until);
END;
$$;

CREATE OR REPLACE FUNCTION public.registration_is_blocked(
  p_fdi VARCHAR,
  p_student_type VARCHAR,
  p_branch VARCHAR,
  p_grade VARCHAR,
  p_cohort INTEGER,
  p_class_number INTEGER,
  p_student_number INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF public.fdi_is_valid(p_fdi) AND EXISTS (
    SELECT 1
    FROM public.penalty_devices d
    JOIN public.account_penalties ap ON ap.id = d.penalty_id
    JOIN public.profiles t ON t.id = ap.target_user_id
    WHERE d.fdi = p_fdi
      AND public.account_ban_is_active(t.account_status, t.ban_until)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE public.account_ban_is_active(p.account_status, p.ban_until)
      AND p.student_type IS NOT DISTINCT FROM p_student_type
      AND p.branch IS NOT DISTINCT FROM p_branch
      AND p.grade IS NOT DISTINCT FROM p_grade
      AND p.cohort IS NOT DISTINCT FROM p_cohort
      AND p.class_number IS NOT DISTINCT FROM p_class_number
      AND p.student_number IS NOT DISTINCT FROM p_student_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_penalties(
  p_target_uid VARCHAR DEFAULT NULL,
  p_actor_uid VARCHAR DEFAULT NULL,
  p_type VARCHAR DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  target_uid VARCHAR,
  actor_uid VARCHAR,
  actor_role VARCHAR,
  penalty_type VARCHAR,
  duration_code VARCHAR,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  reason TEXT,
  source VARCHAR,
  lifted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role VARCHAR := public.get_user_role(auth.uid());
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset INTEGER := (GREATEST(p_page, 1) - 1) * v_limit;
  v_total INTEGER;
BEGIN
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT COUNT(*) INTO v_total
  FROM public.account_penalties ap
  WHERE (p_target_uid IS NULL OR ap.target_uid = p_target_uid)
    AND (p_actor_uid IS NULL OR ap.actor_uid = p_actor_uid)
    AND (p_type IS NULL OR ap.penalty_type = p_type)
    AND (
      v_role = 'dev_admin'
      OR ap.penalty_type IN ('temporary', 'lift_temporary')
    );

  RETURN QUERY
  SELECT ap.id, ap.target_uid, ap.actor_uid, ap.actor_role, ap.penalty_type,
         ap.duration_code, ap.starts_at, ap.ends_at, ap.reason, ap.source,
         ap.lifted_at, ap.created_at, v_total
  FROM public.account_penalties ap
  WHERE (p_target_uid IS NULL OR ap.target_uid = p_target_uid)
    AND (p_actor_uid IS NULL OR ap.actor_uid = p_actor_uid)
    AND (p_type IS NULL OR ap.penalty_type = p_type)
    AND (
      v_role = 'dev_admin'
      OR ap.penalty_type IN ('temporary', 'lift_temporary')
    )
  ORDER BY ap.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_penalty_posts(p_penalty_id UUID)
RETURNS TABLE (
  post_id VARCHAR,
  title TEXT,
  excerpt TEXT,
  author_uid VARCHAR,
  posted_at TIMESTAMPTZ,
  was_deleted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role VARCHAR := public.get_user_role(auth.uid());
  v_type VARCHAR;
BEGIN
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT penalty_type INTO v_type FROM public.account_penalties WHERE id = p_penalty_id;
  IF v_type IS NULL THEN
    RETURN;
  END IF;
  IF v_role = 'admin' AND v_type NOT IN ('temporary', 'lift_temporary') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pp.post_id, pp.title, pp.excerpt, pp.author_uid, pp.posted_at, pp.was_deleted
  FROM public.account_penalty_posts pp
  WHERE pp.penalty_id = p_penalty_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
  p_target_uid VARCHAR DEFAULT NULL,
  p_actor_uid VARCHAR DEFAULT NULL,
  p_action VARCHAR DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  action VARCHAR,
  actor_uid VARCHAR,
  actor_role VARCHAR,
  target_uid VARCHAR,
  payload JSONB,
  created_at TIMESTAMPTZ,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role VARCHAR := public.get_user_role(auth.uid());
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset INTEGER := (GREATEST(p_page, 1) - 1) * v_limit;
  v_total INTEGER;
BEGIN
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT COUNT(*) INTO v_total
  FROM public.admin_audit_logs a
  WHERE (p_target_uid IS NULL OR a.target_uid = p_target_uid)
    AND (p_actor_uid IS NULL OR a.actor_uid = p_actor_uid)
    AND (p_action IS NULL OR a.action = p_action)
    AND (
      v_role = 'dev_admin'
      OR a.action IN (
        'temporary_ban', 'temporary_ban_lifted',
        'password_reset_requested', 'password_reset_approved',
        'password_reset_rejected', 'password_reset_completed'
      )
    );

  RETURN QUERY
  SELECT a.id, a.action, a.actor_uid, a.actor_role, a.target_uid, a.payload, a.created_at, v_total
  FROM public.admin_audit_logs a
  WHERE (p_target_uid IS NULL OR a.target_uid = p_target_uid)
    AND (p_actor_uid IS NULL OR a.actor_uid = p_actor_uid)
    AND (p_action IS NULL OR a.action = p_action)
    AND (
      v_role = 'dev_admin'
      OR a.action IN (
        'temporary_ban', 'temporary_ban_lifted',
        'password_reset_requested', 'password_reset_approved',
        'password_reset_rejected', 'password_reset_completed'
      )
    )
  ORDER BY a.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_user_posts(p_uid VARCHAR)
RETURNS TABLE (
  id VARCHAR,
  title VARCHAR,
  created_at TIMESTAMPTZ,
  is_deleted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT p.id INTO v_user FROM public.profiles p WHERE p.uid = p_uid;
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT po.id::varchar, po.title, po.created_at, po.is_deleted
  FROM public.posts po
  WHERE po.user_id::text = v_user::text
  ORDER BY po.created_at DESC
  LIMIT 100;
END;
$$;

-- ============================================================
-- 7. 密码重置：批准不再写入/下发密码；7 天资格
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_approve_password_reset(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
  v_user_id UUID;
  v_uid VARCHAR(8);
  v_admin_uid VARCHAR(8);
  v_expires TIMESTAMPTZ;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_expires := NOW() + INTERVAL '7 days';

  UPDATE public.password_reset_requests
     SET status = 'approved',
         handler_id = v_admin_id,
         handled_at = NOW(),
         expires_at = v_expires
   WHERE id = p_request_id AND status = 'pending'
   RETURNING user_id INTO v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already handled';
  END IF;

  SELECT uid INTO v_uid FROM public.profiles WHERE id = v_user_id;
  SELECT uid INTO v_admin_uid FROM public.profiles WHERE id = v_admin_id;

  INSERT INTO public.system_messages (user_id, message_type, title, content, target_type, target_id)
  VALUES (
    v_user_id,
    'password_reset_approved',
    '密码重置申请已通过',
    '你的密码重置申请已通过审核。请在 7 天内打开忘记密码页面自行设置新密码。管理员无法查看或生成你的密码。',
    'password_reset_request',
    p_request_id::text
  );

  PERFORM public.penalty_write_audit(
    'password_reset_approved', v_admin_id, v_admin_uid, v_role, v_user_id, v_uid,
    jsonb_build_object('request_id', p_request_id, 'expires_at', v_expires)
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_password_reset(
  p_request_id UUID,
  p_temp_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 兼容旧前端签名；忽略临时密码，禁止再写入或下发明文密码
  RETURN public.admin_approve_password_reset(p_request_id);
END;
$$;

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
  v_uid VARCHAR(8);
  v_admin_uid VARCHAR(8);
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

  SELECT uid INTO v_uid FROM public.profiles WHERE id = v_user_id;
  SELECT uid INTO v_admin_uid FROM public.profiles WHERE id = v_admin_id;

  INSERT INTO public.system_messages (user_id, message_type, title, content, target_type, target_id)
  VALUES (
    v_user_id,
    'password_reset_rejected',
    '密码重置申请未通过',
    COALESCE(NULLIF(trim(p_reason), ''), '管理员未通过你的密码重置申请。'),
    'password_reset_request',
    p_request_id::text
  );

  PERFORM public.penalty_write_audit(
    'password_reset_rejected', v_admin_id, v_admin_uid, v_role, v_user_id, v_uid,
    jsonb_build_object('request_id', p_request_id)
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_password_reset_request(p_uid VARCHAR)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_request_id UUID;
  v_existing_pending UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE uid = p_uid LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '该UID对应的用户不存在';
  END IF;

  SELECT id INTO v_existing_pending FROM public.password_reset_requests
  WHERE user_id = v_user_id AND status = 'pending' LIMIT 1;
  IF v_existing_pending IS NOT NULL THEN
    RETURN v_existing_pending;
  END IF;

  INSERT INTO public.password_reset_requests (user_id, uid, status)
  VALUES (v_user_id, p_uid, 'pending')
  RETURNING id INTO v_request_id;

  PERFORM public.penalty_write_audit(
    'password_reset_requested', NULL, p_uid, 'member', v_user_id, p_uid,
    jsonb_build_object('request_id', v_request_id)
  );
  RETURN v_request_id;
END;
$$;

DROP FUNCTION IF EXISTS public.check_password_reset_status(VARCHAR);
CREATE OR REPLACE FUNCTION public.check_password_reset_status(p_uid VARCHAR)
RETURNS TABLE(
  id UUID,
  status VARCHAR,
  requested_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  admin_note TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT prr.id, prr.status, prr.requested_at, prr.reviewed_at, prr.admin_note, prr.expires_at
  FROM public.password_reset_requests prr
  WHERE prr.uid = p_uid
  ORDER BY prr.requested_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_password_with_approval(
  p_uid VARCHAR,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_request_id UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE uid = p_uid LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT prr.id, prr.expires_at INTO v_request_id, v_expires
  FROM public.password_reset_requests prr
  WHERE prr.uid = p_uid AND prr.status = 'approved'
    AND prr.expires_at IS NOT NULL
    AND prr.expires_at > NOW()
  ORDER BY COALESCE(prr.handled_at, prr.reviewed_at, prr.created_at) DESC
  LIMIT 1;

  IF v_request_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf', 10))
   WHERE id = v_user_id;

  UPDATE public.password_reset_requests
     SET status = 'completed', completed_at = NOW(), updated_at = NOW()
   WHERE id = v_request_id;

  PERFORM public.penalty_write_audit(
    'password_reset_completed', v_user_id, p_uid, 'member', v_user_id, p_uid,
    jsonb_build_object('request_id', v_request_id)
  );
  RETURN TRUE;
END;
$$;

-- ============================================================
-- 8. L4 并入同一套 penalty_apply_core
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_sensitive_handle_hit(
  p_hit_id UUID, p_action VARCHAR, p_result TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hit public.sensitive_word_hits%ROWTYPE;
  v_target UUID;
  v_posts VARCHAR[];
  v_store_status VARCHAR;
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('resolved', 'ignored', 'ban') THEN
    RAISE EXCEPTION '非法处置动作';
  END IF;
  SELECT * INTO v_hit FROM public.sensitive_word_hits WHERE id = p_hit_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_action = 'ban' THEN
    IF v_hit.level < 4 THEN
      RAISE EXCEPTION '仅 L4 命中允许封禁处置';
    END IF;
    v_target := v_hit.user_id::uuid;
    IF EXISTS (
      SELECT 1 FROM public.profiles t
      WHERE t.id = v_target
        AND t.account_status = 'banned'
        AND t.ban_until IS NULL
    ) THEN
      PERFORM public.penalty_write_audit(
        'permanent_ban',
        auth.uid(),
        (SELECT uid FROM public.profiles WHERE id = auth.uid()),
        'dev_admin',
        v_target,
        (SELECT uid FROM public.profiles WHERE id = v_target),
        jsonb_build_object('hit_id', v_hit.id, 'already_permanent', TRUE, 'reason', '敏感词 L4')
      );
    ELSE
      IF v_hit.content_type = 'post' AND v_hit.target_id IS NOT NULL AND length(v_hit.target_id) > 0 THEN
        v_posts := ARRAY[v_hit.target_id::varchar];
      ELSE
        v_posts := ARRAY[]::varchar[];
      END IF;
      PERFORM public.penalty_apply_core(
        auth.uid(),
        v_target,
        'permanent',
        NULL,
        '敏感词 L4',
        v_posts,
        NULL,
        'sensitive_l4',
        jsonb_build_object(
          'hit_id', v_hit.id,
          'content_type', v_hit.content_type,
          'target_id', v_hit.target_id,
          'matched_word', v_hit.matched_word,
          'content_summary', v_hit.content_summary
        )
      );
    END IF;
    v_store_status := 'resolved';
  ELSE
    v_store_status := p_action;
  END IF;

  UPDATE public.sensitive_word_hits
     SET handle_status = v_store_status,
         handler_id = auth.uid(),
         handled_at = NOW()
   WHERE id = p_hit_id;
  RETURN TRUE;
END;
$$;

-- ============================================================
-- 9. RLS：写操作尊重有效封禁（读路径，不写 profiles）
-- ============================================================
DROP POLICY IF EXISTS "School students can create posts" ON public.posts;
CREATE POLICY "School students can create posts"
  ON public.posts FOR INSERT
  WITH CHECK (
    auth.uid()::text = user_id::text
    AND public.auth_account_is_usable()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.student_type = 'school'
        AND profiles.grade IN ('初一', '初二', '初三')
    )
  );

DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE
  USING (
    auth.uid()::text = user_id::text
    AND public.auth_account_is_usable()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.student_type = 'school'
        AND profiles.grade IN ('初一', '初二', '初三')
    )
  )
  WITH CHECK (
    auth.uid()::text = user_id::text
    AND public.auth_account_is_usable()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.student_type = 'school'
        AND profiles.grade IN ('初一', '初二', '初三')
    )
  );

DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;
CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE
  USING (auth.uid()::text = user_id::text AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can create own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can create comments" ON public.comments;
CREATE POLICY "Users can create own comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
CREATE POLICY "Users can update own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can like posts" ON public.post_likes;
CREATE POLICY "Users can like posts"
  ON public.post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can unlike own likes" ON public.post_likes;
DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.post_likes;
CREATE POLICY "Users can unlike own likes"
  ON public.post_likes FOR DELETE
  USING (auth.uid() = user_id AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can save posts" ON public.post_saves;
CREATE POLICY "Users can save posts"
  ON public.post_saves FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can unsave own saves" ON public.post_saves;
DROP POLICY IF EXISTS "Users can unsave their own saves" ON public.post_saves;
CREATE POLICY "Users can unsave own saves"
  ON public.post_saves FOR DELETE
  USING (auth.uid() = user_id AND public.auth_account_is_usable());

DROP POLICY IF EXISTS "Users can create own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
CREATE POLICY "Users can create own reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id AND public.auth_account_is_usable());

-- ============================================================
-- 10. EXECUTE 授权：内部函数不授予客户端
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.audit_logs_immutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.penalty_posts_immutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_penalties_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.penalty_restore_expired_ban(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.penalty_write_audit(VARCHAR, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.penalty_apply_core(UUID, UUID, VARCHAR, VARCHAR, TEXT, VARCHAR[], VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.penalty_lift_core(VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.penalty_usable_dev_admin_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.penalty_duration_interval(VARCHAR) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.account_ban_is_active(VARCHAR, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_ban_is_active(VARCHAR, TIMESTAMPTZ) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.account_is_usable_status(VARCHAR, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_is_usable_status(VARCHAR, TIMESTAMPTZ) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.auth_account_is_usable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_account_is_usable() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fdi_is_valid(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fdi_is_valid(TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.restore_own_expired_ban() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_own_expired_ban() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_user_post() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_post() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_apply_penalty(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR[], VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_penalty(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR[], VARCHAR) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_lift_temporary_ban(VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_lift_temporary_ban(VARCHAR, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.dev_admin_lift_permanent_ban(VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_admin_lift_permanent_ban(VARCHAR, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.dev_admin_grant_admin(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_admin_grant_admin(VARCHAR) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.dev_admin_revoke_admin(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_admin_revoke_admin(VARCHAR) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.uid_has_active_ban(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uid_has_active_ban(VARCHAR) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.registration_is_blocked(VARCHAR, VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_is_blocked(VARCHAR, VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER, INTEGER) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_list_penalties(VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_penalties(VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_list_penalty_posts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_penalty_posts(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_list_audit_logs(VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_list_user_posts(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_posts(VARCHAR) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_approve_password_reset(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_password_reset(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_approve_password_reset(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_password_reset(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reject_password_reset(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_password_reset(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_password_reset_request(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_password_reset_request(VARCHAR) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_password_reset_status(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_password_reset_status(VARCHAR) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_password_with_approval(VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_password_with_approval(VARCHAR, TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_sensitive_handle_hit(UUID, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_handle_hit(UUID, VARCHAR, TEXT) TO authenticated;

-- 历史 banned 行检查（只读，不 UPDATE）
SELECT COUNT(*) AS historic_banned_permanent_semantic
FROM public.profiles
WHERE account_status = 'banned' AND ban_until IS NULL;

SELECT 'account penalty audit system v1 phase1 applied (no historic banned rows mutated)' AS result;
