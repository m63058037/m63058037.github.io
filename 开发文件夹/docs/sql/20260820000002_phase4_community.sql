-- ============================================================
-- 第四阶段：社区能力 — 搜索、通知、消息、用户主页、举报审核、管理后台、公告、权限
-- 创建日期: 2026-08-20
-- 修订日期: 2026-08-21 — 修复与实际数据库 Schema 不一致的字段名
-- 前置条件: 20260820000001_post_branches_migration.sql 已执行
-- 幂等: 可重复执行，不会报错
-- 安全: 不修改历史表结构，不删除历史数据
--       所有 SECURITY DEFINER 函数设置 SET search_path = public
--
-- Schema 对照说明（Phase 1-3 实际字段）：
--   profiles 表：无 is_active 字段，使用 account_status VARCHAR(20)
--                无 name 字段，使用 nickname VARCHAR(100)
--                无 student_id 字段，使用 student_number INTEGER
--                无 password_hash 字段（密码由 Supabase Auth 管理）
--                有 role, uid, branch, grade, cohort 字段
--   posts 表：无 status 字段，无 branch 字段，无 author_id/author_name/author_branch 字段
--             使用 user_id VARCHAR, likes_count, comments_count, favorites_count, views_count
--   reports 表：使用 content 字段（非 description），status CHECK 允许 pending/processing/resolved/rejected
--   password_reset_requests 表：使用 uid 字段（非 student_id），无 full_name/branch/reason 字段
-- ============================================================

-- ============================================================
-- 1. system_messages — 用户系统消息表
--    用于：密码重置结果、举报处理结果、管理员操作结果、系统重要提醒
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- 接收用户
  message_type VARCHAR(50) NOT NULL, -- password_reset_approved / password_reset_rejected / report_handled / system
  title VARCHAR(200) NOT NULL,
  content TEXT,
  target_type VARCHAR(50), -- password_reset_request / report / post / announcement
  target_id VARCHAR(100),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_system_messages_user_id ON public.system_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_system_messages_user_id_read ON public.system_messages(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_system_messages_created_at ON public.system_messages(created_at DESC);

-- RLS
ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;

-- 用户只能读取自己的消息
DROP POLICY IF EXISTS system_messages_select_own ON public.system_messages;
CREATE POLICY system_messages_select_own ON public.system_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- 用户只能标记自己的消息为已读（不能插入新消息，消息由系统/RPC生成）
DROP POLICY IF EXISTS system_messages_update_own ON public.system_messages;
CREATE POLICY system_messages_update_own ON public.system_messages
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 不允许普通用户插入或删除消息
-- 消息只能通过 SECURITY DEFINER RPC 创建

-- ============================================================
-- 2. admin_notifications — 管理员通知表
--    用于：新的忘记密码申请、新的举报、其他管理员事件
--    通知对所有管理员可见，阅读状态按管理员记录
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type VARCHAR(50) NOT NULL, -- new_password_reset / new_report / system
  title VARCHAR(200) NOT NULL,
  content TEXT,
  target_type VARCHAR(50) NOT NULL, -- password_reset_request / report
  target_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON public.admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_target ON public.admin_notifications(target_type, target_id);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- 仅管理员可读取（使用 account_status 字段，非 is_active）
DROP POLICY IF EXISTS admin_notifications_select_admin ON public.admin_notifications;
CREATE POLICY admin_notifications_select_admin ON public.admin_notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'dev_admin')
        AND p.account_status = 'active'
    )
  );

-- 管理员通知阅读状态表
CREATE TABLE IF NOT EXISTS public.admin_notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(notification_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_reads_admin ON public.admin_notification_reads(admin_id);

ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_notification_reads_select_own ON public.admin_notification_reads;
CREATE POLICY admin_notification_reads_select_own ON public.admin_notification_reads
  FOR SELECT
  USING (auth.uid() = admin_id);

DROP POLICY IF EXISTS admin_notification_reads_insert_own ON public.admin_notification_reads;
CREATE POLICY admin_notification_reads_insert_own ON public.admin_notification_reads
  FOR INSERT
  WITH CHECK (auth.uid() = admin_id);

-- ============================================================
-- 3. announcements — 全站公告表
--    仅开发管理员可发布
-- ============================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON public.announcements(published_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 所有登录用户可查看已发布公告
DROP POLICY IF EXISTS announcements_select_published ON public.announcements;
CREATE POLICY announcements_select_published ON public.announcements
  FOR SELECT
  USING (status = 'published');

-- 仅开发管理员可查看全部（含草稿）
-- 通过 RPC 实现，不走直接表访问

-- ============================================================
-- 4. announcement_reads — 公告阅读确认表
--    每个用户 × 每条公告只确认一次
-- ============================================================

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON public.announcement_reads(user_id);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_reads_select_own ON public.announcement_reads;
CREATE POLICY announcement_reads_select_own ON public.announcement_reads
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS announcement_reads_insert_own ON public.announcement_reads;
CREATE POLICY announcement_reads_insert_own ON public.announcement_reads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. 扩展 reports 表 — 增加处理字段
--    注意：reports 表已有 content 字段（非 description）
--    已有 status CHECK: pending/processing/resolved/rejected
--    已有 resolved_by, resolved_at, admin_note 字段
--    本 Migration 增加 handler_id, handle_result, handled_at 为 Phase 4 使用
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'handler_id') THEN
    ALTER TABLE public.reports ADD COLUMN handler_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'handle_result') THEN
    ALTER TABLE public.reports ADD COLUMN handle_result TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'handled_at') THEN
    ALTER TABLE public.reports ADD COLUMN handled_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- 确保 status 字段存在（第三阶段已创建，幂等处理）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'status') THEN
    ALTER TABLE public.reports ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

-- ============================================================
-- 6. 扩展 password_reset_requests 表 — 增加处理字段
--    注意：该表已有 uid, user_id, status, reviewed_by, reviewed_at, admin_note 字段
--    本 Migration 增加 handler_id, handled_at, handle_note, temp_password
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'password_reset_requests' AND column_name = 'handler_id') THEN
    ALTER TABLE public.password_reset_requests ADD COLUMN handler_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'password_reset_requests' AND column_name = 'handled_at') THEN
    ALTER TABLE public.password_reset_requests ADD COLUMN handled_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'password_reset_requests' AND column_name = 'handle_note') THEN
    ALTER TABLE public.password_reset_requests ADD COLUMN handle_note TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'password_reset_requests' AND column_name = 'temp_password') THEN
    ALTER TABLE public.password_reset_requests ADD COLUMN temp_password VARCHAR(255);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_password_reset_status ON public.password_reset_requests(status);
CREATE INDEX IF NOT EXISTS idx_password_reset_created_at ON public.password_reset_requests(created_at DESC);

-- ============================================================
-- 7. 触发器：新的忘记密码申请 → 管理员通知
--    注意：password_reset_requests 表使用 uid 字段（非 full_name/student_id）
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_password_reset_notify_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.admin_notifications (notification_type, title, content, target_type, target_id)
    VALUES (
      'new_password_reset',
      '新的密码重置申请',
      '用户 UID ' || COALESCE(NEW.uid, '未知') || ' 提交了密码重置申请',
      'password_reset_request',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_password_reset_notify_admin ON public.password_reset_requests;
CREATE TRIGGER trg_password_reset_notify_admin
  AFTER INSERT ON public.password_reset_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_password_reset_notify_admin();

-- ============================================================
-- 8. 触发器：新的举报 → 管理员通知
--    注意：reports 表使用 content 字段（非 description）
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_report_notify_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (notification_type, title, content, target_type, target_id)
  VALUES (
    'new_report',
    '新的举报',
    '收到新的举报：' || NEW.report_type || ' - ' || COALESCE(NEW.content, '无说明'),
    'report',
    NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_notify_admin ON public.reports;
CREATE TRIGGER trg_report_notify_admin
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_report_notify_admin();

-- ============================================================
-- 9. 公告 updated_at 触发器
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_announcements_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_announcements_updated_at();

-- ============================================================
-- 10. 辅助函数：获取用户角色（供 SECURITY DEFINER 函数内部使用）
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
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_role, 'member');
END;
$$;

-- ============================================================
-- 11. 用户消息相关 RPC
-- ============================================================

-- 获取当前用户的消息列表
CREATE OR REPLACE FUNCTION public.get_user_messages(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  message_type VARCHAR,
  title VARCHAR,
  content TEXT,
  target_type VARCHAR,
  target_id VARCHAR,
  is_read BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_offset INTEGER := (p_page - 1) * p_page_size;
  v_total INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.system_messages WHERE user_id = v_user_id;

  RETURN QUERY
  SELECT
    sm.id,
    sm.message_type,
    sm.title,
    sm.content,
    sm.target_type,
    sm.target_id,
    sm.is_read,
    sm.created_at,
    v_total
  FROM public.system_messages sm
  WHERE sm.user_id = v_user_id
  ORDER BY sm.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- 获取未读消息数量
CREATE OR REPLACE FUNCTION public.get_unread_message_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.system_messages
  WHERE user_id = v_user_id AND is_read = FALSE;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- 标记消息为已读
CREATE OR REPLACE FUNCTION public.mark_message_read(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.system_messages
  SET is_read = TRUE
  WHERE id = p_message_id AND user_id = v_user_id;

  RETURN FOUND;
END;
$$;

-- ============================================================
-- 12. 搜索相关 RPC
--    注意：posts 表使用 user_id（非 author_id），无 status/branch 字段
--    分支信息在 post_branches 表，作者信息在 profiles 表
--    posts 使用 likes_count/comments_count/favorites_count/views_count（非 like_count 等）
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_posts(
  p_keyword TEXT,
  p_branch VARCHAR DEFAULT 'all',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id VARCHAR,
  title VARCHAR,
  content TEXT,
  tags VARCHAR[],
  branch VARCHAR,
  author_id VARCHAR,
  author_name VARCHAR,
  author_branch VARCHAR,
  like_count INTEGER,
  comment_count INTEGER,
  favorite_count INTEGER,
  view_count INTEGER,
  is_hot BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INTEGER := (p_page - 1) * p_page_size;
  v_keyword TEXT := lower(trim(p_keyword));
  v_search_like TEXT := '%' || v_keyword || '%';
  v_total INTEGER;
BEGIN
  IF v_keyword = '' OR v_keyword IS NULL THEN
    RAISE EXCEPTION 'Keyword is required';
  END IF;
  IF length(v_keyword) < 1 THEN
    RAISE EXCEPTION 'Keyword too short';
  END IF;

  -- 计算总数（posts 无 status 字段，仅过滤 is_deleted）
  IF p_branch = 'all' THEN
    SELECT COUNT(DISTINCT p.id) INTO v_total
    FROM public.posts p
    LEFT JOIN public.post_branches pb ON p.id = pb.post_id
    WHERE p.is_deleted = FALSE
      AND (
        lower(p.title) LIKE v_search_like
        OR lower(p.content) LIKE v_search_like
        OR EXISTS (
          SELECT 1 FROM unnest(p.tags) t WHERE lower(t) LIKE v_search_like
        )
      );
  ELSE
    SELECT COUNT(DISTINCT p.id) INTO v_total
    FROM public.posts p
    INNER JOIN public.post_branches pb ON p.id = pb.post_id
    WHERE p.is_deleted = FALSE
      AND pb.branch = p_branch
      AND (
        lower(p.title) LIKE v_search_like
        OR lower(p.content) LIKE v_search_like
        OR EXISTS (
          SELECT 1 FROM unnest(p.tags) t WHERE lower(t) LIKE v_search_like
        )
      );
  END IF;

  -- 返回分页结果
  IF p_branch = 'all' THEN
    RETURN QUERY
    SELECT
      p.id,
      p.title,
      p.content,
      p.tags,
      MAX(pb.branch) as branch,
      p.user_id,
      pr.nickname as author_name,
      pr.branch as author_branch,
      p.likes_count,
      p.comments_count,
      p.favorites_count,
      p.views_count,
      p.is_hot,
      p.created_at,
      v_total
    FROM public.posts p
    LEFT JOIN public.post_branches pb ON p.id = pb.post_id
    LEFT JOIN public.profiles pr ON p.user_id = pr.id::text
    WHERE p.is_deleted = FALSE
      AND (
        lower(p.title) LIKE v_search_like
        OR lower(p.content) LIKE v_search_like
        OR EXISTS (
          SELECT 1 FROM unnest(p.tags) t WHERE lower(t) LIKE v_search_like
        )
      )
    GROUP BY p.id, p.title, p.content, p.tags, p.user_id, pr.nickname, pr.branch,
             p.likes_count, p.comments_count, p.favorites_count, p.views_count,
             p.is_hot, p.created_at
    ORDER BY p.created_at DESC
    LIMIT p_page_size
    OFFSET v_offset;
  ELSE
    RETURN QUERY
    SELECT
      p.id,
      p.title,
      p.content,
      p.tags,
      MAX(pb.branch) as branch,
      p.user_id,
      pr.nickname as author_name,
      pr.branch as author_branch,
      p.likes_count,
      p.comments_count,
      p.favorites_count,
      p.views_count,
      p.is_hot,
      p.created_at,
      v_total
    FROM public.posts p
    INNER JOIN public.post_branches pb ON p.id = pb.post_id
    LEFT JOIN public.profiles pr ON p.user_id = pr.id::text
    WHERE p.is_deleted = FALSE
      AND pb.branch = p_branch
      AND (
        lower(p.title) LIKE v_search_like
        OR lower(p.content) LIKE v_search_like
        OR EXISTS (
          SELECT 1 FROM unnest(p.tags) t WHERE lower(t) LIKE v_search_like
        )
      )
    GROUP BY p.id, p.title, p.content, p.tags, p.user_id, pr.nickname, pr.branch,
             p.likes_count, p.comments_count, p.favorites_count, p.views_count,
             p.is_hot, p.created_at
    ORDER BY p.created_at DESC
    LIMIT p_page_size
    OFFSET v_offset;
  END IF;
END;
$$;

-- ============================================================
-- 13. 用户主页相关 RPC
--    注意：profiles 使用 nickname（非 name），account_status（非 is_active）
--    student_number INTEGER（非 student_id VARCHAR）
--    posts 使用 user_id（非 author_id），无 status 字段
-- ============================================================

-- 获取公开用户信息（其他用户可见）
CREATE OR REPLACE FUNCTION public.get_user_public_profile(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  branch VARCHAR,
  grade VARCHAR,
  post_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_post_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_post_count
  FROM public.posts
  WHERE user_id = p_user_id::text
    AND is_deleted = FALSE;

  RETURN QUERY
  SELECT
    p.id,
    p.nickname,
    p.branch,
    p.grade,
    v_post_count
  FROM public.profiles p
  WHERE p.id = p_user_id
    AND p.account_status = 'active';
END;
$$;

-- 获取用户自己的完整信息
CREATE OR REPLACE FUNCTION public.get_user_full_profile()
RETURNS TABLE (
  id UUID,
  uid VARCHAR,
  name VARCHAR,
  student_id VARCHAR,
  branch VARCHAR,
  grade VARCHAR,
  cohort INTEGER,
  role VARCHAR,
  status VARCHAR,
  account_status VARCHAR,
  post_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_post_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COUNT(*) INTO v_post_count
  FROM public.posts
  WHERE user_id = v_user_id::text
    AND is_deleted = FALSE;

  RETURN QUERY
  SELECT
    p.id,
    p.uid,
    p.nickname,
    p.student_number::varchar,
    p.branch,
    p.grade,
    p.cohort,
    p.role,
    CASE
      WHEN p.account_status = 'active' THEN 'normal'
      ELSE p.account_status
    END::varchar as status,
    p.account_status,
    v_post_count,
    p.created_at
  FROM public.profiles p
  WHERE p.id = v_user_id;
END;
$$;

-- ============================================================
-- 14. 管理员 Dashboard RPC
--    注意：profiles 使用 account_status（非 is_active）
--    posts 无 status 字段，仅过滤 is_deleted
-- ============================================================

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

-- ============================================================
-- 15. 管理员通知 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_notifications(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  notification_type VARCHAR,
  title VARCHAR,
  content TEXT,
  target_type VARCHAR,
  target_id VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE,
  is_read BOOLEAN,
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

  SELECT COUNT(*) INTO v_total FROM public.admin_notifications;

  RETURN QUERY
  SELECT
    an.id,
    an.notification_type,
    an.title,
    an.content,
    an.target_type,
    an.target_id,
    an.created_at,
    EXISTS (
      SELECT 1 FROM public.admin_notification_reads anr
      WHERE anr.notification_id = an.id AND anr.admin_id = v_user_id
    ) AS is_read,
    v_total
  FROM public.admin_notifications an
  ORDER BY an.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role VARCHAR;
BEGIN
  v_role := public.get_user_role(v_user_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.admin_notification_reads (notification_id, admin_id)
  VALUES (p_notification_id, v_user_id)
  ON CONFLICT (notification_id, admin_id) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 16. 忘记密码审核 RPC
--    注意：password_reset_requests 表使用 uid（非 student_id）
--    无 full_name/branch/reason 字段，需 JOIN profiles 获取用户信息
--    profiles 无 password_hash 字段，密码由 Supabase Auth 管理
--    临时密码存储在 password_reset_requests.temp_password 中
-- ============================================================

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

  SELECT COUNT(*) INTO v_total FROM public.password_reset_requests WHERE status = p_status;

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

  -- 更新申请状态（临时密码加密存储）
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

  -- profiles 无 password_hash 字段，密码由 Supabase Auth 管理
  -- 临时密码存储在 password_reset_requests.temp_password，通过系统消息告知用户

  SELECT nickname INTO v_user_name FROM public.profiles WHERE id = v_user_id;

  -- 生成系统消息通知用户
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

  -- 生成系统消息通知用户
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

-- ============================================================
-- 17. 举报审核 RPC
--    注意：reports 表使用 content 字段（非 description）
--    status CHECK 约束允许: pending/processing/resolved/rejected
--    前端发送 'handled'，数据库存储 'resolved'，返回时映射回 'handled'
-- ============================================================

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

CREATE OR REPLACE FUNCTION public.admin_handle_report(
  p_report_id UUID,
  p_action VARCHAR, -- 'handled' or 'rejected'
  p_result TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
  v_reporter_id UUID;
  v_target_type VARCHAR;
  v_target_id VARCHAR;
  v_db_status VARCHAR;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_action NOT IN ('handled', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  -- 前端发送 'handled'，映射为数据库 CHECK 约束允许的 'resolved'
  v_db_status := CASE WHEN p_action = 'handled' THEN 'resolved' ELSE p_action END;

  UPDATE public.reports
  SET status = v_db_status,
      handler_id = v_admin_id,
      handle_result = p_result,
      handled_at = NOW()
  WHERE id = p_report_id AND status = 'pending'
  RETURNING reporter_id, target_type, target_id INTO v_reporter_id, v_target_type, v_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already handled';
  END IF;

  -- 通知举报人处理结果
  INSERT INTO public.system_messages (user_id, message_type, title, content, target_type, target_id)
  VALUES (
    v_reporter_id,
    'report_handled',
    CASE WHEN p_action = 'handled' THEN '举报已处理' ELSE '举报已驳回' END,
    '你提交的举报处理结果：' || COALESCE(p_result, '未说明原因'),
    v_target_type,
    v_target_id
  );

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 18. 公告 RPC — 开发管理员
--    注意：profiles 使用 nickname（非 name）
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_create_announcement(
  p_title VARCHAR,
  p_content TEXT,
  p_publish BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
  v_id UUID;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role != 'dev_admin' THEN
    RAISE EXCEPTION 'Permission denied: only dev_admin can create announcements';
  END IF;

  INSERT INTO public.announcements (title, content, author_id, status, published_at)
  VALUES (
    p_title,
    p_content,
    v_admin_id,
    CASE WHEN p_publish THEN 'published' ELSE 'draft' END,
    CASE WHEN p_publish THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_announcement(
  p_id UUID,
  p_title VARCHAR,
  p_content TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role != 'dev_admin' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.announcements
  SET title = p_title, content = p_content
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_announcement(
  p_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_role VARCHAR;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role != 'dev_admin' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.announcements
  SET status = 'published', published_at = NOW()
  WHERE id = p_id AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement not found or already published';
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_announcements(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  content TEXT,
  author_id UUID,
  author_name VARCHAR,
  status VARCHAR,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
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
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role != 'dev_admin' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.announcements;

  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.content,
    a.author_id,
    p.nickname as author_name,
    a.status,
    a.published_at,
    a.created_at,
    a.updated_at,
    v_total
  FROM public.announcements a
  LEFT JOIN public.profiles p ON a.author_id = p.id
  ORDER BY a.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- ============================================================
-- 19. 公告 RPC — 用户端
--    注意：profiles 使用 nickname（非 name）
-- ============================================================

-- 获取用户未读的已发布公告（用于弹窗展示）
CREATE OR REPLACE FUNCTION public.get_unread_announcements()
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  content TEXT,
  author_name VARCHAR,
  published_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.content,
    p.nickname as author_name,
    a.published_at
  FROM public.announcements a
  LEFT JOIN public.profiles p ON a.author_id = p.id
  WHERE a.status = 'published'
    AND a.published_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.announcement_reads ar
      WHERE ar.announcement_id = a.id AND ar.user_id = v_user_id
    )
  ORDER BY a.published_at DESC;
END;
$$;

-- 标记公告为已读
CREATE OR REPLACE FUNCTION public.mark_announcement_read(p_announcement_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.announcement_reads (announcement_id, user_id)
  VALUES (p_announcement_id, v_user_id)
  ON CONFLICT (announcement_id, user_id) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 20. 权限检查辅助 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 'guest';
  END IF;
  RETURN public.get_user_role(v_user_id);
END;
$$;

-- ============================================================
-- 第四阶段 Migration 结束
-- ============================================================
