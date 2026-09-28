-- ============================================================
-- 敏感词系统 —— 数据库最终兜底层（DB Final Enforcement）
-- 版本号: 20260829000000
-- 创建日期: 2026-08-29
-- 说明: 让数据库成为敏感词系统的最后安全边界。即使绕过前端预检 / Service 层，
--       直接用 Supabase ANON key 写库，敏感内容也会在本层被拒绝写入。
--       本文件仅作设计/待部署内容创建，需人工在 Supabase SQL 中手动运行，脚本本身不执行。
--
-- 前置条件: 20260820000000_registration_system_refactor.sql
--           20260820000002_phase4_community.sql
--           20260826000000_rls_hardening.sql  已执行
--
-- 幂等: 全部使用 DROP/DO/IF NOT EXISTS + CREATE OR REPLACE 写法，可安全重复执行。
-- 安全: 不修改表结构；不碰 posts.id 类型；启用/保留 RLS；不使用 service_role；
--       所有 SECURITY DEFINER 函数均 SET search_path = public，
--       管理 RPC 在函数内部用 get_user_role(auth.uid()) 二次校验 dev_admin，
--       REVOKE PUBLIC EXECUTE + 仅向 authenticated 授权。
--
-- 规则依据: 《敏感词.txt》v1.0 + 阶段0 106 条 TC，未增删、未降/提等级、未扩大模糊匹配。
--           核心原则：宁可精确拦截，不做无限制模糊匹配。
--
-- 说明（重要）: PostgreSQL 事务原子性下，被拒绝(reject)的写入会一并回滚，
--         因此「拒绝写入」这一最终兜底由 BEFORE 触发器完成（必然生效）；
--         L3/L4「命中记录」由独立 RPC log_sensitive_hit 完成（应用/Service 在写入前调用，独立于被拒绝语句提交）。
--         详见报告「L3/L4 记录机制与事务原子性说明」。
-- ============================================================

-- ============================================================
-- 第一部分：敏感词词典表 sensitive_words
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensitive_words (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  word          TEXT NOT NULL,                -- 词典词条（统一小写存储，中文/英文/数字同一张表）
  lang          VARCHAR(10) NOT NULL DEFAULT 'zh',  -- zh | en
  level         INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
  rule_type     VARCHAR(20) NOT NULL          -- contains | combo | char_indep | digit | english
                CHECK (rule_type IN ('contains','combo','char_indep','digit','english')),
  pattern_hint  VARCHAR(200),                 -- 规则/人读提示（如 '独立字' 或规则描述）
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  hit_count     BIGINT NOT NULL DEFAULT 0,
  created_by    TEXT,                         -- NULL=系统种子数据
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT sensitive_words_word_lang_uq UNIQUE (word, lang)
);

COMMENT ON TABLE public.sensitive_words IS '敏感词词典（数据化，后续增词不改业务代码）';

-- 词典查询 / 检测用索引
CREATE INDEX IF NOT EXISTS idx_sensitive_words_active
  ON public.sensitive_words (is_active, level DESC);

-- 词典表 RLS：默认不允许 any 角色直读/改。仅 SECURITY DEFINER 函数（检测、管理 RPC）可访问。
ALTER TABLE public.sensitive_words ENABLE ROW LEVEL SECURITY;
-- 不创建任何 anon/authenticated policy => 普通用户与普通管理员都无法直读词典表。

-- ============================================================
-- 第二部分：L4 配置表 sensitive_word_config（配置驱动，不硬编码阈值）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensitive_word_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description VARCHAR(255)
);

INSERT INTO public.sensitive_word_config (key, value, description) VALUES
  ('l4_repeat_window_days', '7',  'L4 重复判定窗口（天）'),
  ('l4_repeat_count',       '3',  '窗口内 L4 次数达到该值即为重复'),
  ('l4_action',             'ban','L4 自动建议动作：ban | warn')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 第三部分：L3/L4 命中记录表 sensitive_word_hits
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensitive_word_hits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,                       -- 兼容 posts.user_id(VARCHAR)/comments.user_id(UUID)
  user_name       VARCHAR(100),                        -- 命中时用户昵称快照
  level           INTEGER NOT NULL CHECK (level BETWEEN 3 AND 4),
  matched_word    TEXT NOT NULL,
  rule_type       VARCHAR(20) NOT NULL,
  content_type    VARCHAR(30) NOT NULL
                  CHECK (content_type IN ('post','comment','profile','report','announcement')),
  target_id       TEXT,                                -- 对应内容主键的字符串形式
  field_name      VARCHAR(30),                         -- 命中的字段（title/content/nickname/signature/bio）
  content_summary TEXT,                                -- 内容摘要（截断，不含完整原文之外多余信息）
  is_repeat       BOOLEAN NOT NULL DEFAULT FALSE,
  handle_status   VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (handle_status IN ('pending','processing','resolved','ignored')),
  handler_id      UUID,                                -- 处理管理员（参考 reports.handler_id）
  handled_at      TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sensitive_word_hits IS 'L3/L4 敏感词命中记录（仅 dev_admin 可查看/处置）';

CREATE INDEX IF NOT EXISTS idx_sensitive_word_hits_level  ON public.sensitive_word_hits (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_word_hits_user   ON public.sensitive_word_hits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensitive_word_hits_status ON public.sensitive_word_hits (handle_status, created_at DESC);

-- 命中记录 RLS：默认不允许 any 角色直读。仅 dev_admin 通过管理 RPC 查看。
ALTER TABLE public.sensitive_word_hits ENABLE ROW LEVEL SECURITY;
-- 不创建任何 anon/authenticated policy => 普通用户无法读取违规日志。

-- 命中记录有 updated_at 维护触发器（可选，便于审计更新）
DROP TRIGGER IF EXISTS trg_sensitive_word_hits_updated_at ON public.sensitive_word_hits;
CREATE TRIGGER trg_sensitive_word_hits_updated_at
  BEFORE UPDATE ON public.sensitive_word_hits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 第四部分：复合返回类型 sv_hit（检测结果：level + 命中词 + 规则）
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sv_hit' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.sv_hit AS (
      level      INTEGER,
      matched_word TEXT,
      rule_type  TEXT
    );
  END IF;
END;
$$;

-- ============================================================
-- 第五部分：归一化与匹配辅助函数（SECURITY DEFINER，内部使用，不对外授权）
-- ============================================================

-- sv_analyze: 文本归一化，产出两个视图
--   c = 纯字母数字中文（去空格标点）  —— 用于 combo / contains 的子串匹配
--   a = 保留单空格分隔的字母数字中文 —— 用于 char_indep / digit / english 的边界匹配
-- 覆盖: 全角→半角、大写→小写、零宽/不可见字符剔除、空白折叠。
CREATE OR REPLACE FUNCTION public.sv_analyze(p_text TEXT, OUT a TEXT, OUT c TEXT)
RETURNS RECORD
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  i INT; n INT; ch TEXT; cp INT; a_buf TEXT := ''; c_buf TEXT := ''; prev_space BOOLEAN := FALSE;
BEGIN
  a := ''; c := ''; n := length(p_text);
  FOR i IN 1..n LOOP
    ch := substr(p_text, i, 1);
    cp := ascii(ch);
    -- 剔除不可见/零宽字符
    IF cp IN (0xAD, 0x180E, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF) THEN CONTINUE; END IF;
    -- 全角(FF01-FF5E) → 半角
    IF cp BETWEEN 65281 AND 65374 THEN ch := chr(cp - 65248); cp := ascii(ch); END IF;
    -- 全角空格 U+3000 → 半角空格
    IF cp = 12288 THEN ch := ' '; cp := 32; END IF;
    -- 大写→小写
    IF cp BETWEEN 65 AND 90 THEN ch := lower(ch); cp := ascii(ch); END IF;
    -- 保留 中文(CJK 4E00-9FA5) | 小写字母 | 数字
    IF (cp BETWEEN 19968 AND 40869) OR (cp BETWEEN 97 AND 122) OR (cp BETWEEN 48 AND 57) THEN
      a_buf := a_buf || ch;
      c_buf := c_buf || ch;
      prev_space := FALSE;
    ELSE
      -- a 视作单空格分隔符，c 跳过；折叠连续分隔，去除首尾
      IF NOT prev_space AND a_buf <> '' THEN a_buf := a_buf || ' '; END IF;
      prev_space := TRUE;
    END IF;
  END LOOP;
  a := btrim(a_buf);
  c := c_buf;
  RETURN;
END;
$$;

-- sv_has_indep: 独立词匹配（char_indep）
-- 依据: JS 规则 `(^|[^中文 a-z0-9])word([^中文 a-z0-9]|$)` 作用于 a 视图
--       a 视图只有 {中文/字母/数字/单空格}，故边界字符即「空格或串首/串尾」。
CREATE OR REPLACE FUNCTION public.sv_has_indep(p_a TEXT, p_word TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  i INT := 0; rel INT; s INT; e INT; wlen INT; pre TEXT; post TEXT;
BEGIN
  IF p_word = '' OR p_a = '' THEN RETURN FALSE; END IF;
  wlen := length(p_word);
  LOOP
    rel := position(p_word IN substr(p_a, i + 1));
    IF rel = 0 THEN EXIT; END IF;
    s := i + rel;
    e := s + wlen - 1;
    pre  := CASE WHEN s = 1 THEN NULL ELSE substr(p_a, s - 1, 1) END;
    post := CASE WHEN e >= length(p_a) THEN NULL ELSE substr(p_a, e + 1, 1) END;
    IF (pre IS NULL OR pre = ' ') AND (post IS NULL OR post = ' ') THEN RETURN TRUE; END IF;
    i := s;
  END LOOP;
  RETURN FALSE;
END;
$$;

-- sv_has_digit: 独立数字边界匹配（digit）
-- 依据: JS 规则 `(?<!\d)word(?!\d)` —— 前后都不紧邻数字才算独立（长数字内含 91/78 不误伤）。
CREATE OR REPLACE FUNCTION public.sv_has_digit(p_a TEXT, p_word TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  i INT := 0; rel INT; s INT; e INT; wlen INT; pre TEXT; post TEXT;
BEGIN
  IF p_word = '' THEN RETURN FALSE; END IF;
  wlen := length(p_word);
  i := 0;
  LOOP
    rel := position(p_word IN substr(p_a, i + 1));
    IF rel = 0 THEN EXIT; END IF;
    s := i + rel;
    e := s + wlen - 1;
    pre  := CASE WHEN s = 1 THEN NULL ELSE substr(p_a, s - 1, 1) END;
    post := CASE WHEN e >= length(p_a) THEN NULL ELSE substr(p_a, e + 1, 1) END;
    IF (pre IS NULL OR NOT (pre BETWEEN '0' AND '9')) AND (post IS NULL OR NOT (post BETWEEN '0' AND '9')) THEN
      RETURN TRUE;
    END IF;
    i := s;
  END LOOP;
  RETURN FALSE;
END;
$$;

-- sv_has_english: 英文权重合检测（english），复刻 JS 正则语义
-- 依据: 逐字母匹配，字母间允许 0..2 个「非 字母/数字/中文」分隔（a 视图已折叠为单空格→0..1 空格），
--       命中片段前后不能是英文小写字母（`(^|[^a-z]) ... ($|[^a-z])`）。
--       复刻 TC：fuck / f u c k / F-U-C-K / 全角圆破；且 f中国uck 不命中。
CREATE OR REPLACE FUNCTION public.sv_has_english(p_a TEXT, p_word TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  letters TEXT; L INT; s INT; j INT; k INT; matched BOOLEAN;
BEGIN
  letters := regexp_replace(p_word, '[^a-z]', '', 'g');  -- 去掉词内空格，只留字母序列
  IF letters = '' THEN RETURN FALSE; END IF;
  L := length(letters);
  IF L > length(p_a) THEN RETURN FALSE; END IF;
  FOR s IN 1..length(p_a) LOOP
    -- 首字母必须匹配，且满足起始边界 (^|[^a-z])
    IF substr(p_a, s, 1) <> substr(letters, 1, 1) THEN CONTINUE; END IF;
    IF s > 1 AND substr(p_a, s - 1, 1) BETWEEN 'a' AND 'z' THEN CONTINUE; END IF;
    j := s; k := 1; matched := TRUE;
    WHILE k <= L LOOP
      IF j <= length(p_a) AND substr(p_a, j, 1) = substr(letters, k, 1) THEN
        j := j + 1; k := k + 1;
      ELSIF j <= length(p_a) AND substr(p_a, j, 1) = ' ' THEN
        -- 允许 1 个空格分隔；随后必须命中下一个字母
        j := j + 1;
        IF j > length(p_a) OR substr(p_a, j, 1) <> substr(letters, k, 1) THEN
          matched := FALSE; EXIT;
        END IF;
        j := j + 1; k := k + 1;
      ELSE
        matched := FALSE; EXIT;
      END IF;
    END LOOP;
    IF matched THEN
      -- 结束边界 ($|[^a-z])
      IF j > length(p_a) OR NOT (substr(p_a, j, 1) BETWEEN 'a' AND 'z') THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;
  RETURN FALSE;
END;
$$;

-- sv_check_text: 唯一检测入口。返回最高命中级（含命中词/规则）。
-- SECURITY DEFINER + search_path=public。仅用于触发器(owner 上下文)与管理 RPC，不对外授权。
CREATE OR REPLACE FUNCTION public.sv_check_text(p_text TEXT) RETURNS public.sv_hit
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d RECORD; ana RECORD; hit_level INT := 0; mw TEXT := NULL; rt TEXT := NULL; rex BOOLEAN;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN (0, NULL, NULL)::public.sv_hit; END IF;
  SELECT a, c INTO ana FROM public.sv_analyze(p_text);
  IF ana.c = '' THEN RETURN (0, NULL, NULL)::public.sv_hit; END IF;
  -- 按等级降序扫描，首个命中即最高等级命中（多个敏感词并存取最高）
  FOR d IN
    SELECT word, lang, level, rule_type FROM public.sensitive_words
    WHERE is_active = TRUE
    ORDER BY level DESC, id ASC
  LOOP
    rex := FALSE;
    IF d.rule_type = 'contains' THEN
      rex := position(d.word IN ana.a) > 0;
    ELSIF d.rule_type = 'combo' THEN
      rex := position(d.word IN ana.c) > 0;
    ELSIF d.rule_type = 'char_indep' THEN
      rex := public.sv_has_indep(ana.a, d.word);
    ELSIF d.rule_type = 'digit' THEN
      rex := public.sv_has_digit(ana.a, d.word);
    ELSIF d.rule_type = 'english' THEN
      rex := public.sv_has_english(ana.a, d.word);
    END IF;
    IF rex THEN
      hit_level := d.level; mw := d.word; rt := d.rule_type; EXIT;
    END IF;
  END LOOP;
  RETURN (hit_level, mw, rt)::public.sv_hit;
END;
$$;

-- ============================================================
-- 第六部分：数据库最终兜底 —— 业务表 BEFORE 触发器（拒绝敏感写入）
-- ============================================================
-- 说明：这些触发函数为 SECURITY DEFINER（owner 上下文），
--       因而能读字典且无需对 anon/authenticated 授权 sv_check_text（避免词库 oracle 泄露）。
--       任一命中(≥L1)即整条语句回滚 → 数据库层最终拒绝，无法写入敏感词内容。

-- posts.title / posts.content
CREATE OR REPLACE FUNCTION public.sv_reject_posts() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE h public.sv_hit;
BEGIN
  h := public.sv_check_text(NEW.title);
  IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  IF NEW.content IS NOT NULL THEN
    h := public.sv_check_text(NEW.content);
    IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_posts_sensitive_reject ON public.posts;
CREATE TRIGGER trg_posts_sensitive_reject
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.sv_reject_posts();

-- comments.content（评论与回复共用）
CREATE OR REPLACE FUNCTION public.sv_reject_comments() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE h public.sv_hit;
BEGIN
  h := public.sv_check_text(NEW.content);
  IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_comments_sensitive_reject ON public.comments;
CREATE TRIGGER trg_comments_sensitive_reject
  BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.sv_reject_comments();

-- profiles.nickname / signature / bio（用户名称、个性签名、简介）
CREATE OR REPLACE FUNCTION public.sv_reject_profiles() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE h public.sv_hit;
BEGIN
  IF NEW.nickname IS NOT NULL THEN
    h := public.sv_check_text(NEW.nickname);
    IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  END IF;
  IF NEW.signature IS NOT NULL THEN
    h := public.sv_check_text(NEW.signature);
    IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  END IF;
  IF NEW.bio IS NOT NULL THEN
    h := public.sv_check_text(NEW.bio);
    IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_sensitive_reject ON public.profiles;
CREATE TRIGGER trg_profiles_sensitive_reject
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sv_reject_profiles();

-- reports.content（举报说明，可空）
CREATE OR REPLACE FUNCTION public.sv_reject_reports() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE h public.sv_hit;
BEGIN
  IF NEW.content IS NOT NULL THEN
    h := public.sv_check_text(NEW.content);
    IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reports_sensitive_reject ON public.reports;
CREATE TRIGGER trg_reports_sensitive_reject
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.sv_reject_reports();

-- announcements.title / content（管理员公告；触发器对 RPC 写入同样生效，dev_admin 也无法绕过）
CREATE OR REPLACE FUNCTION public.sv_reject_announcements() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE h public.sv_hit;
BEGIN
  h := public.sv_check_text(NEW.title);
  IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  IF NEW.content IS NOT NULL THEN
    h := public.sv_check_text(NEW.content);
    IF h.level > 0 THEN RAISE EXCEPTION 'SENSITIVE_CONTENT' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_announcements_sensitive_reject ON public.announcements;
CREATE TRIGGER trg_announcements_sensitive_reject
  BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.sv_reject_announcements();

-- ============================================================
-- 第七部分：客户端检测词典端点（前端/Service 引擎读取活跃词典，用于预检）
-- ============================================================
-- 仅返回活跃且安全的列（word/lang/level/rule_type/pattern_hint），不含 hit_count/created_by 等管理数据。
-- 与已随前端发布的初始镜像一致，供 get_active_sensitive_words 使用。
CREATE OR REPLACE FUNCTION public.get_active_sensitive_words()
RETURNS TABLE (word TEXT, lang VARCHAR, level INTEGER, rule_type VARCHAR, pattern_hint VARCHAR)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT s.word, s.lang, s.level, s.rule_type, s.pattern_hint
    FROM public.sensitive_words s
    WHERE s.is_active = TRUE
    ORDER BY s.level DESC, s.id ASC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_sensitive_words() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_sensitive_words() TO anon, authenticated;

-- ============================================================
-- 第八部分：L3/L4 命中记录端点 + L4 管理员通知
-- ============================================================

-- L4 配置读取辅助（内部）
CREATE OR REPLACE FUNCTION public.sv_config(p_key TEXT) RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT value FROM public.sensitive_word_config WHERE key = p_key;
$$;

-- log_sensitive_hit: 安全记录 L3/L4 命中（authenticated 可调用，独立提交，不受被拒写入回滚影响）
-- 安全性：用户身份以 auth.uid() 为准（不可伪造）；命中词/等级由 sv_check_text 重新计算（不可伪造）；非 L3/L4 不记录。
-- 调用时机：应用/Service 层在检测到 L3/L4 且拒绝写入前调用（写入前独立日志，避免被回滚）。
CREATE OR REPLACE FUNCTION public.log_sensitive_hit(
  p_content_type VARCHAR,
  p_target_id    TEXT,
  p_content      TEXT,
  p_field_name   VARCHAR
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_role   VARCHAR;
  v_hit    public.sv_hit;
  v_name   VARCHAR(100);
  v_summary TEXT;
  v_repeat BOOLEAN := FALSE;
  v_count  BIGINT;
  v_win_days INTEGER;
  v_l4_cnt   INTEGER;
  v_hit_id   UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(nickname, '') INTO v_name FROM public.profiles WHERE id = v_uid;
  v_role := public.get_user_role(v_uid);
  IF v_role IS NULL OR v_role = 'guest' THEN RETURN 0; END IF;

  v_hit := public.sv_check_text(p_content);
  IF v_hit.level < 3 THEN RETURN 0; END IF;

  v_summary := left(p_content, 300);

  -- L4 重复判定（配置驱动：窗口天数 / 阈值）
  IF v_hit.level >= 4 THEN
    SELECT COALESCE(NULLIF(public.sv_config('l4_repeat_window_days'), '')::INTEGER, 7)
      INTO v_win_days;
    SELECT COALESCE(NULLIF(public.sv_config('l4_repeat_count'), '')::INTEGER, 3)
      INTO v_l4_cnt;
    SELECT count(*) INTO v_count
      FROM public.sensitive_word_hits
      WHERE user_id = v_uid::text AND level >= 4
        AND created_at >= NOW() - make_interval(days => v_win_days);
    v_repeat := (v_count >= v_l4_cnt);
  END IF;

  INSERT INTO public.sensitive_word_hits
    (user_id, user_name, level, matched_word, rule_type, content_type,
     target_id, field_name, content_summary, is_repeat, handle_status)
  VALUES
    (v_uid::text, v_name, v_hit.level, v_hit.matched_word, v_hit.rule_type, p_content_type,
     p_target_id, p_field_name, v_summary, v_repeat, 'pending')
  RETURNING id INTO v_hit_id;

  -- 计数累加
  UPDATE public.sensitive_words SET hit_count = hit_count + 1
    WHERE word = v_hit.matched_word AND is_active = TRUE;

  RETURN v_hit.level;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_sensitive_hit(VARCHAR, TEXT, TEXT, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_sensitive_hit(VARCHAR, TEXT, TEXT, VARCHAR) TO authenticated;

-- L4 命中 → 自动生成管理员待办通知（AFTER INSERT 触发，独立于记录事务，可靠提交）
CREATE OR REPLACE FUNCTION public.sv_notify_admin_on_l4() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.level >= 4 THEN
    -- 遵循既有 admin_notifications 列（notification_type/title/content/target_type/target_id），
    -- 见 phase4 trigger trg_report_notify_admin 落库惯例。
    INSERT INTO public.admin_notifications
      (notification_type, title, content, target_type, target_id)
    VALUES
      ('system', '敏感词L4命中待处理',
       '用户 ' || COALESCE(NEW.user_name, NEW.user_id) || ' 触发 L4 敏感词（规则 ' ||
       NEW.rule_type || '），请进入敏感词管理处理。',
       'sensitive_word_hit', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sensitive_word_hits_notify_admin ON public.sensitive_word_hits;
CREATE TRIGGER trg_sensitive_word_hits_notify_admin
  AFTER INSERT ON public.sensitive_word_hits
  FOR EACH ROW WHEN (NEW.level >= 4)
  EXECUTE FUNCTION public.sv_notify_admin_on_l4();

-- ============================================================
-- 第九部分：dev_admin 敏感词管理 RPC（SECURITY DEFINER + 内部角色二次校验）
-- ============================================================
-- 统一角色校验：函数内部调用 get_user_role(auth.uid())，非 dev_admin 一律拒绝。
-- 全部 REVOKE PUBLIC EXECUTE，仅 GRANT authenticated，且函数内再校验，不依赖前端隐藏菜单。

-- 9.1 列表/检索（支持按词条模糊、按状态过滤；含停用词）
CREATE OR REPLACE FUNCTION public.admin_sensitive_words_get(
  p_q VARCHAR DEFAULT NULL,
  p_active BOOLEAN DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS TABLE (
  id BIGINT, word TEXT, lang VARCHAR, level INTEGER, rule_type VARCHAR,
  pattern_hint VARCHAR, is_active BOOLEAN, hit_count BIGINT,
  created_by TEXT, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT s.id, s.word, s.lang, s.level, s.rule_type, s.pattern_hint,
           s.is_active, s.hit_count, s.created_by, s.created_at, s.updated_at
      FROM public.sensitive_words s
      WHERE (p_q IS NULL OR s.word ILIKE '%' || p_q || '%')
        AND (p_active IS NULL OR s.is_active = p_active)
      ORDER BY s.created_at DESC
      LIMIT GREATEST(1, p_page_size) OFFSET (GREATEST(1, p_page) - 1) * GREATEST(1, p_page_size);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sensitive_words_get(VARCHAR, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_words_get(VARCHAR, BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- 9.2 新增词条
CREATE OR REPLACE FUNCTION public.admin_sensitive_word_add(
  p_word TEXT, p_lang VARCHAR, p_level INTEGER, p_rule_type VARCHAR, p_pattern_hint VARCHAR
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id BIGINT;
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  IF btrim(coalesce(p_word,'')) = '' THEN RAISE EXCEPTION '词条不能为空'; END IF;
  IF p_level NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION '等级必须为 1-4'; END IF;
  IF p_rule_type NOT IN ('contains','combo','char_indep','digit','english') THEN
    RAISE EXCEPTION '规则类型不合法';
  END IF;
  INSERT INTO public.sensitive_words (word, lang, level, rule_type, pattern_hint, is_active, created_by)
  VALUES (lower(p_word), p_lang, p_level, p_rule_type, p_pattern_hint, TRUE, auth.uid()::text)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sensitive_word_add(TEXT, VARCHAR, INTEGER, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_word_add(TEXT, VARCHAR, INTEGER, VARCHAR, VARCHAR) TO authenticated;

-- 9.3 修改词条
CREATE OR REPLACE FUNCTION public.admin_sensitive_word_update(
  p_id BIGINT, p_word TEXT, p_lang VARCHAR, p_level INTEGER,
  p_rule_type VARCHAR, p_pattern_hint VARCHAR, p_is_active BOOLEAN
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  UPDATE public.sensitive_words
     SET word = lower(p_word), lang = p_lang, level = p_level, rule_type = p_rule_type,
         pattern_hint = p_pattern_hint, is_active = p_is_active, updated_at = NOW()
   WHERE id = p_id;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sensitive_word_update(BIGINT, TEXT, VARCHAR, INTEGER, VARCHAR, VARCHAR, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_word_update(BIGINT, TEXT, VARCHAR, INTEGER, VARCHAR, VARCHAR, BOOLEAN) TO authenticated;

-- 9.4 停用/启用（软删除）
CREATE OR REPLACE FUNCTION public.admin_sensitive_word_set_active(p_id BIGINT, p_active BOOLEAN) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  UPDATE public.sensitive_words SET is_active = p_active, updated_at = NOW() WHERE id = p_id;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sensitive_word_set_active(BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_word_set_active(BIGINT, BOOLEAN) TO authenticated;

-- 9.5 硬删除
CREATE OR REPLACE FUNCTION public.admin_sensitive_word_delete(p_id BIGINT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.sensitive_words WHERE id = p_id;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sensitive_word_delete(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_word_delete(BIGINT) TO authenticated;

-- 9.6 查看 L3/L4 命中记录
CREATE OR REPLACE FUNCTION public.admin_sensitive_hits_get(
  p_level INTEGER DEFAULT NULL,
  p_handle_status VARCHAR DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID, user_id TEXT, user_name VARCHAR, level INTEGER, matched_word TEXT,
  rule_type VARCHAR, content_type VARCHAR, target_id TEXT, field_name VARCHAR,
  content_summary TEXT, is_repeat BOOLEAN, handle_status VARCHAR,
  handler_id UUID, handled_at TIMESTAMP WITH TIME ZONE, created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT h.id, h.user_id, h.user_name, h.level, h.matched_word, h.rule_type,
           h.content_type, h.target_id, h.field_name, h.content_summary, h.is_repeat,
           h.handle_status, h.handler_id, h.handled_at, h.created_at
      FROM public.sensitive_word_hits h
      WHERE (p_level IS NULL OR h.level = p_level)
        AND (p_handle_status IS NULL OR h.handle_status = p_handle_status)
      ORDER BY h.created_at DESC
      LIMIT GREATEST(1, p_page_size) OFFSET (GREATEST(1, p_page) - 1) * GREATEST(1, p_page_size);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sensitive_hits_get(INTEGER, VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_hits_get(INTEGER, VARCHAR, INTEGER, INTEGER) TO authenticated;

-- 9.7 L4 / 命中处置（含封禁，仅 dev_admin）
-- 说明：p_action = 'resolved' | 'ignored' | 'ban'。p_action='ban' 且命中为 L4 时，
--       将 profiles.account_status 置为 'banned'（尊重既有 CHECK 枚举与 RLS，由 SECURITY DEFINER 写）。
CREATE OR REPLACE FUNCTION public.admin_sensitive_handle_hit(
  p_hit_id UUID, p_action VARCHAR, p_result TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hit public.sensitive_word_hits%ROWTYPE;
  v_cur_level INTEGER;
BEGIN
  IF public.get_user_role(auth.uid()) <> 'dev_admin' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('resolved','ignored','ban') THEN
    RAISE EXCEPTION '非法处置动作';
  END IF;
  SELECT * INTO v_hit FROM public.sensitive_word_hits WHERE id = p_hit_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF p_action = 'ban' THEN
    IF v_hit.level < 4 THEN
      RAISE EXCEPTION '仅 L4 命中允许封禁处置';
    END IF;
    -- 尊重既有 account_status 体系；被封禁用户 get_user_role 返回 'guest'，自动被既有 RLS/权限拒之门外
    UPDATE public.profiles
       SET account_status = 'banned', updated_at = NOW()
     WHERE id = v_hit.user_id::uuid;
  END IF;

  UPDATE public.sensitive_word_hits
     SET handle_status = p_action,
         handler_id = auth.uid(),
         handled_at = NOW()
   WHERE id = p_hit_id;
  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sensitive_handle_hit(UUID, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sensitive_handle_hit(UUID, VARCHAR, TEXT) TO authenticated;

-- ============================================================
-- 第十部分：初始词典种子数据 —— 严格取自《敏感词.txt》v1.0 既有 62 条，不增删不改
--           与 services/sensitive-word.js 的 INITIAL_DICTIONARY 一一对应。
-- ============================================================
INSERT INTO public.sensitive_words (word, lang, level, rule_type, pattern_hint, is_active, created_by, hit_count) VALUES
  -- 中文 L1
  ('操', 'zh', 1, 'char_indep', '独立字', TRUE, NULL, 0),
  ('操你', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('妈的', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('他妈的', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('他妈', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('傻逼', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('傻b', 'zh', 1, 'contains', '包含(归一后)', TRUE, NULL, 0),
  ('煞笔', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('沙比', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('脑残', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('白痴', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('废物', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('垃圾', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  ('滚', 'zh', 1, 'char_indep', '独立字', TRUE, NULL, 0),
  ('去死', 'zh', 1, 'contains', '包含', TRUE, NULL, 0),
  -- 中文数字组合（独立边界）
  ('91', 'zh', 1, 'digit', '独立数字', TRUE, NULL, 0),
  ('78', 'zh', 1, 'digit', '独立数字', TRUE, NULL, 0),
  -- 中文 L2
  ('操你妈', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('草你妈', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('草泥马', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('死妈', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('死你妈', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('全家去死', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('你妈死了', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('你妈的', 'zh', 2, 'contains', '包含', TRUE, NULL, 0),
  ('妈逼', 'zh', 2, 'combo', '组合', TRUE, NULL, 0),
  ('逼', 'zh', 2, 'char_indep', '独立字', TRUE, NULL, 0),
  ('婊子', 'zh', 2, 'contains', '包含', TRUE, NULL, 0),
  ('贱人', 'zh', 2, 'contains', '包含', TRUE, NULL, 0),
  ('畜生', 'zh', 2, 'contains', '包含', TRUE, NULL, 0),
  ('狗东西', 'zh', 2, 'contains', '包含', TRUE, NULL, 0),
  ('狗日的', 'zh', 2, 'contains', '包含', TRUE, NULL, 0),
  ('杂种', 'zh', 2, 'contains', '包含', TRUE, NULL, 0),
  -- 中文 L3
  ('去你妈的', 'zh', 3, 'combo', '组合', TRUE, NULL, 0),
  ('你全家都去死', 'zh', 3, 'combo', '组合', TRUE, NULL, 0),
  ('全家死光', 'zh', 3, 'combo', '组合', TRUE, NULL, 0),
  ('死全家', 'zh', 3, 'combo', '组合', TRUE, NULL, 0),
  ('全家不得好死', 'zh', 3, 'combo', '组合', TRUE, NULL, 0),
  -- 英文 L1
  ('damn', 'en', 1, 'english', '英文', TRUE, NULL, 0),
  ('hell', 'en', 1, 'english', '英文', TRUE, NULL, 0),
  ('crap', 'en', 1, 'english', '英文', TRUE, NULL, 0),
  ('idiot', 'en', 1, 'english', '英文', TRUE, NULL, 0),
  ('stupid', 'en', 1, 'english', '英文', TRUE, NULL, 0),
  ('shut up', 'en', 1, 'english', '英文', TRUE, NULL, 0),
  ('dumb', 'en', 1, 'english', '英文', TRUE, NULL, 0),
  -- 英文 L2
  ('fuck', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('fucking', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('fucker', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('motherfucker', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('shit', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('bullshit', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('bitch', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('asshole', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('dick', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('bastard', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  ('son of a bitch', 'en', 2, 'english', '英文', TRUE, NULL, 0),
  -- 英文 L3
  ('fuck you', 'en', 3, 'english', '英文', TRUE, NULL, 0),
  ('fuck off', 'en', 3, 'english', '英文', TRUE, NULL, 0),
  ('go to hell', 'en', 3, 'english', '英文', TRUE, NULL, 0),
  ('piece of shit', 'en', 3, 'english', '英文', TRUE, NULL, 0),
  ('you are a bitch', 'en', 3, 'english', '英文', TRUE, NULL, 0),
  ('you are an asshole', 'en', 3, 'english', '英文', TRUE, NULL, 0)
ON CONFLICT (word, lang) DO NOTHING;

-- ============================================================
-- 尾声：内部函数不对外授权（防词库 oracle），仅 owner/触发器/管理 RPC 在 SECURITY DEFINER 上下文使用。
-- 显式再收口一次，确保 sv_* 内部函数不被任意角色直接调用。
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.sv_analyze(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_has_indep(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_has_digit(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_has_english(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_check_text(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_config(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_reject_posts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_reject_comments() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_reject_profiles() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_reject_reports() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_reject_announcements() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sv_notify_admin_on_l4() FROM PUBLIC;