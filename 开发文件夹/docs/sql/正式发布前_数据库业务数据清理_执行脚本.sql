-- ============================================================
-- 正式发布前 · 数据库业务数据清理 · 执行脚本 v1.0（最终版）
-- 运行环境：Supabase Dashboard → SQL Editor（postgres 角色）
-- 使用方式：按 ①→⑤ 逐段执行，核对每段结果后再继续。
-- 任何一步报错：立即停止，不要改写/跳过，把报错信息和已成功步骤反馈回来。
-- 不使用 ANON key / REST API / 本地伪造；不删除表结构/RLS/RPC/触发器/桶。
-- ============================================================


-- ① 保留账号快照（只读）——先执行，确认线上真实存在的 dev_admin/admin
SELECT p.id, p.uid, p.nickname, p.role, p.account_status, u.email
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('dev_admin','admin')
ORDER BY p.role, p.created_at;


-- ② 清理业务数据（子表在前，显式 DELETE，不使用 TRUNCATE）
DELETE FROM public.admin_notification_reads;
DELETE FROM public.admin_notifications;
DELETE FROM public.announcement_reads;
DELETE FROM public.announcements;
DELETE FROM public.system_messages;
DELETE FROM public.password_reset_requests;
DELETE FROM public.reports;          -- reports 必须在删除用户前清空（resolved_by 无级联）
DELETE FROM public.post_images;
DELETE FROM public.post_branches;
DELETE FROM public.post_likes;
DELETE FROM public.post_saves;
DELETE FROM public.comments WHERE parent_comment_id IS NOT NULL;  -- 先删回复
DELETE FROM public.comments WHERE parent_comment_id IS NULL;      -- 再删主评论
DELETE FROM public.posts;            -- posts.user_id 为 VARCHAR，必须显式删除
DELETE FROM public.sensitive_word_hits;  -- 清历史命中记录，保留表结构


-- ③ 清理非管理员用户（保留 role IN ('dev_admin','admin')）
-- 安全闸门：确认至少存在一个 dev_admin，否则中止
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'dev_admin') THEN
    RAISE EXCEPTION '未找到 dev_admin 账号，中止清理';
  END IF;
END $$;

-- 删除非管理员 auth.users（会级联清理其 profiles）
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT id FROM public.profiles WHERE role IN ('dev_admin','admin')
);

-- 防御性清理可能残留的非管理员 profile
DELETE FROM public.profiles
WHERE role NOT IN ('dev_admin','admin');

-- 说明：如删除 auth.users 时因 auth 子表外键报错，
-- 请停止并按报错提示反馈（不要自行追加删除 auth.identities 等，除非明确授权）。


-- ④ 清理 Storage 旧对象（保留 avatars / post-images 桶及其策略）
DELETE FROM storage.objects WHERE bucket_id = 'avatars';
DELETE FROM storage.objects WHERE bucket_id = 'post-images';


-- ⑤ 清理完成后的只读验证 SQL
-- 5.1 业务/内容表应为 0
SELECT 'posts' t, count(*) FROM public.posts
UNION ALL SELECT 'post_images', count(*) FROM public.post_images
UNION ALL SELECT 'post_branches', count(*) FROM public.post_branches
UNION ALL SELECT 'comments', count(*) FROM public.comments
UNION ALL SELECT 'post_likes', count(*) FROM public.post_likes
UNION ALL SELECT 'post_saves', count(*) FROM public.post_saves
UNION ALL SELECT 'reports', count(*) FROM public.reports
UNION ALL SELECT 'system_messages', count(*) FROM public.system_messages
UNION ALL SELECT 'admin_notifications', count(*) FROM public.admin_notifications
UNION ALL SELECT 'admin_notification_reads', count(*) FROM public.admin_notification_reads
UNION ALL SELECT 'announcements', count(*) FROM public.announcements
UNION ALL SELECT 'announcement_reads', count(*) FROM public.announcement_reads
UNION ALL SELECT 'password_reset_requests', count(*) FROM public.password_reset_requests
UNION ALL SELECT 'sensitive_word_hits', count(*) FROM public.sensitive_word_hits;

-- 5.2 框架数据完整保留
SELECT count(*) AS sensitive_words_count FROM public.sensitive_words;   -- 期望 62
SELECT count(*) AS config_count FROM public.sensitive_word_config;      -- 期望 3
SELECT count(*) AS categories_count FROM public.categories;             -- 期望 7

-- 5.3 管理员保留、非管理员清零
SELECT id, uid, nickname, role, account_status
FROM public.profiles WHERE role IN ('dev_admin','admin');               -- 期望仍列出管理员

SELECT count(*) AS non_admin_profiles FROM public.profiles
WHERE role NOT IN ('dev_admin','admin');                                -- 期望 0

SELECT count(*) AS non_admin_users FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles WHERE role IN ('dev_admin','admin')); -- 期望 0

-- 5.2 框架数据完整保留
SELECT count(*) AS sensitive_words_count FROM public.sensitive_words;   -- 期望 62
SELECT count(*) AS config_count FROM public.sensitive_word_config;      -- 期望 3
SELECT count(*) AS categories_count FROM public.categories;             -- 期望 7

-- 5.3 管理员保留、非管理员清零
SELECT id, uid, nickname, role, account_status
FROM public.profiles WHERE role IN ('dev_admin','admin');               -- 期望仍列出管理员

SELECT count(*) AS non_admin_profiles FROM public.profiles
WHERE role NOT IN ('dev_admin','admin');                                -- 期望 0

SELECT count(*) AS non_admin_users FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles WHERE role IN ('dev_admin','admin')); -- 期望 0

-- 5.4 Storage 桶保留、旧对象清空
SELECT id, name, public FROM storage.buckets;                           -- 期望 avatars 与 post-images 仍在

SELECT bucket_id, count(*) FROM storage.objects
WHERE bucket_id IN ('avatars','post-images') GROUP BY bucket_id;        -- 期望 count = 0

-- 5.5 框架对象抽查（触发器仍在）
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_posts_sensitive_reject','trg_comments_sensitive_reject',
                 'trg_profiles_sensitive_reject','trg_reports_sensitive_reject',
                 'trg_announcements_sensitive_reject','on_auth_user_created')
ORDER BY tgname;