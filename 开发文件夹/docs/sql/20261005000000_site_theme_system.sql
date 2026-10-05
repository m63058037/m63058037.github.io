-- ============================================================
-- 全站 UI 颜色系统（Theme / Color System）v1
-- 创建日期: 2026-10-05
-- 说明: 全局单例主题配置；仅 dev_admin 可写；公开只读 RPC 供前台加载。
-- 幂等: IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT
-- 安全: RLS 启用且无 anon/authenticated 直表策略；SECURITY DEFINER + get_user_role
-- ============================================================

-- ============================================================
-- 1. 表：site_theme_settings（全站仅 id=1 一行）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_theme_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  theme_name VARCHAR(100) NOT NULL DEFAULT '正式版 1.0',
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

COMMENT ON TABLE public.site_theme_settings IS '全站 UI 主题配置（单例）';

ALTER TABLE public.site_theme_settings ENABLE ROW LEVEL SECURITY;
-- 不创建 SELECT/INSERT/UPDATE policy => 禁止客户端直读写

-- ============================================================
-- 2. 校验辅助
-- ============================================================
CREATE OR REPLACE FUNCTION public.site_theme_is_valid_hex(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_value ~ '^#[0-9A-Fa-f]{6}$';
$$;

CREATE OR REPLACE FUNCTION public.site_theme_validate_config(p_config JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cat TEXT;
  v_key TEXT;
  v_val TEXT;
  v_required JSONB := '{
    "button": ["primaryBg","primaryText","secondaryBg","secondaryText","primaryHover","disabledBg","disabledText"],
    "background": ["page","secondary","input","special"],
    "card": ["background","border","inner"],
    "text": ["primary","secondary","weak","link","emphasis"]
  }'::jsonb;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RETURN FALSE;
  END IF;
  FOR v_cat IN SELECT jsonb_object_keys(v_required)
  LOOP
    IF NOT (p_config ? v_cat) OR jsonb_typeof(p_config->v_cat) <> 'object' THEN
      RETURN FALSE;
    END IF;
    FOR v_key IN SELECT jsonb_array_elements_text(v_required->v_cat)
    LOOP
      v_val := p_config->v_cat->>v_key;
      IF NOT public.site_theme_is_valid_hex(v_val) THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END LOOP;
  RETURN TRUE;
END;
$$;

-- 正式版 1.0 默认 JSON（与 config/theme-defaults.js 一致）
CREATE OR REPLACE FUNCTION public.site_theme_default_config()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '{
    "button": {
      "primaryBg": "#4F8A4F",
      "primaryText": "#FFFFFF",
      "secondaryBg": "#000000",
      "secondaryText": "#4F8A4F",
      "primaryHover": "#3F7340",
      "disabledBg": "#D5DBD0",
      "disabledText": "#9AA096"
    },
    "background": {
      "page": "#EFF5EB",
      "secondary": "#F0F5EC",
      "input": "#E8F0E6",
      "special": "#F8FBF6"
    },
    "card": {
      "background": "#F0F5EC",
      "border": "#C2C9BE",
      "inner": "#E8F0E6"
    },
    "text": {
      "primary": "#191D17",
      "secondary": "#424940",
      "weak": "#72796F",
      "link": "#4F8A4F",
      "emphasis": "#1B3B1C"
    }
  }'::jsonb;
$$;

INSERT INTO public.site_theme_settings (id, theme_name, config)
VALUES (1, '正式版 1.0', public.site_theme_default_config())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. 公开读取（登录页/游客可用）
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_public_site_theme()
RETURNS TABLE (
  theme_name TEXT,
  config JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT s.theme_name::text, s.config, s.updated_at
  FROM public.site_theme_settings s
  WHERE s.id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_site_theme() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_theme() TO anon, authenticated;

-- ============================================================
-- 4. dev_admin 管理 RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.dev_admin_get_site_theme()
RETURNS TABLE (
  theme_name TEXT,
  config JSONB,
  updated_at TIMESTAMPTZ,
  updated_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role VARCHAR;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  v_role := public.get_user_role(v_uid);
  IF v_role <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied: dev_admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.theme_name::text, s.config, s.updated_at, s.updated_by
  FROM public.site_theme_settings s
  WHERE s.id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dev_admin_get_site_theme() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_admin_get_site_theme() TO authenticated;

CREATE OR REPLACE FUNCTION public.dev_admin_save_site_theme(
  p_config JSONB,
  p_theme_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  theme_name TEXT,
  config JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role VARCHAR;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  v_role := public.get_user_role(v_uid);
  IF v_role <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied: dev_admin only' USING ERRCODE = '42501';
  END IF;

  IF NOT public.site_theme_validate_config(p_config) THEN
    RAISE EXCEPTION 'invalid theme config' USING ERRCODE = '22023';
  END IF;

  v_name := COALESCE(NULLIF(btrim(p_theme_name), ''), '正式版 1.0');

  UPDATE public.site_theme_settings
  SET theme_name = v_name,
      config = p_config,
      updated_at = NOW(),
      updated_by = v_uid
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.site_theme_settings (id, theme_name, config, updated_by)
    VALUES (1, v_name, p_config, v_uid);
  END IF;

  RETURN QUERY
  SELECT s.theme_name::text, s.config, s.updated_at
  FROM public.site_theme_settings s
  WHERE s.id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dev_admin_save_site_theme(JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_admin_save_site_theme(JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.dev_admin_reset_site_theme()
RETURNS TABLE (
  theme_name TEXT,
  config JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role VARCHAR;
  v_default JSONB := public.site_theme_default_config();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  v_role := public.get_user_role(v_uid);
  IF v_role <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied: dev_admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.site_theme_settings
  SET theme_name = '正式版 1.0',
      config = v_default,
      updated_at = NOW(),
      updated_by = v_uid
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.site_theme_settings (id, theme_name, config, updated_by)
    VALUES (1, '正式版 1.0', v_default, v_uid);
  END IF;

  RETURN QUERY
  SELECT s.theme_name::text, s.config, s.updated_at
  FROM public.site_theme_settings s
  WHERE s.id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dev_admin_reset_site_theme() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_admin_reset_site_theme() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.site_theme_is_valid_hex(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.site_theme_validate_config(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.site_theme_default_config() FROM PUBLIC;
