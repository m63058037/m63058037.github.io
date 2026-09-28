-- ============================================================
-- 正式管理员账号切换 · 执行脚本 v1.0
-- 目标：68436964 → 唯一 dev_admin；48413338 → 移除并彻底删除
-- 运行环境：Supabase Dashboard → SQL Editor（postgres 角色）
-- 使用方式：① 只读确认 → 人工核对 → ② 切换与删除 → ③ 只读验证
-- 任何一步报错立即停止，反馈具体报错；不得自行删除 auth.identities 等 Auth 表。
-- 关键映射：68436964 / 48413338 是 profiles.uid（VARCHAR(8)），不是 auth.users.id（UUID）。
-- ============================================================


-- ① 只读确认（先执行，核对无误后再执行②）
-- ①.1 两个账号的对应关系（uid → auth.users.id / email / role / account_status）
SELECT p.uid,
       p.id AS auth_users_id,
       p.nickname,
       p.role,
       p.account_status,
       u.email
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.uid IN ('68436964','48413338')
ORDER BY p.uid;
-- 期望：两条各返回 1 行，且 p.id 不同；若某 uid 返回 0 行，说明 ID 不是 profiles.uid，请停止确认。

-- ①.2 现有全部管理员账号（用于事后核对"其他管理员未被修改"）
SELECT p.uid, p.id, p.nickname, p.role, p.account_status, u.email
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('dev_admin','admin')
ORDER BY p.role, p.created_at;
-- 注意：若此列表除 68436964 / 48413338 外还存在其它 dev_admin，
--      则切换后并非"唯一 dev_admin"，请先确认是否需要一并处理。

-- ①.3 48413338 的业务数据依赖统计（决定②.3 需要删除的行数）
SELECT
  (SELECT count(*) FROM public.posts WHERE user_id = p.id::text) AS posts,
  (SELECT count(*) FROM public.comments WHERE user_id = p.id) AS comments,
  (SELECT count(*) FROM public.post_likes WHERE user_id = p.id) AS likes,
  (SELECT count(*) FROM public.post_saves WHERE user_id = p.id) AS saves,
  (SELECT count(*) FROM public.reports WHERE reporter_id = p.id OR resolved_by = p.id) AS reports,
  (SELECT count(*) FROM public.system_messages WHERE user_id = p.id) AS sys_msgs,
  (SELECT count(*) FROM public.admin_notification_reads WHERE admin_id = p.id) AS adm_reads,
  (SELECT count(*) FROM public.announcements WHERE author_id = p.id) AS announcements
FROM public.profiles p
WHERE p.uid = '48413338';


-- ② 账号切换 + 删除旧测试账号
-- ②.1 将 68436964 提升为 dev_admin（SQL Editor 下 auth.uid() 为 NULL，protect_profile_fields 不拦截）
UPDATE public.profiles
SET role = 'dev_admin',
    account_status = 'active'
WHERE uid = '68436964';

-- ②.2 移除 48413338 管理员身份（随后整号删除）
UPDATE public.profiles
SET role = 'member'
WHERE uid = '48413338';

-- ②.3 删除 48413338 的业务数据（子表在前；若①.3 各计数为 0，以下均为无害空操作）
DELETE FROM public.reports
WHERE reporter_id = (SELECT id FROM public.profiles WHERE uid = '48413338')
   OR resolved_by  = (SELECT id FROM public.profiles WHERE uid = '48413338');

DELETE FROM public.admin_notification_reads
WHERE admin_id = (SELECT id FROM public.profiles WHERE uid = '48413338');

DELETE FROM public.announcements
WHERE author_id = (SELECT id FROM public.profiles WHERE uid = '48413338');

DELETE FROM public.system_messages
WHERE user_id = (SELECT id FROM public.profiles WHERE uid = '48413338');

DELETE FROM public.comments
WHERE user_id = (SELECT id FROM public.profiles WHERE uid = '48413338');

DELETE FROM public.post_likes
WHERE user_id = (SELECT id FROM public.profiles WHERE uid = '48413338');

DELETE FROM public.post_saves
WHERE user_id = (SELECT id FROM public.profiles WHERE uid = '48413338');

-- 帖子及其附件（post_images / post_branches 无可靠外键，需随帖子一并删除）；
-- 若①.3 中 posts 计数为 0，可跳过以下三句。
DELETE FROM public.post_images
WHERE post_id IN (SELECT id FROM public.posts WHERE user_id = (SELECT id::text FROM public.profiles WHERE uid = '48413338'));

DELETE FROM public.post_branches
WHERE post_id IN (SELECT id FROM public.posts WHERE user_id = (SELECT id::text FROM public.profiles WHERE uid = '48413338'));

DELETE FROM public.posts
WHERE user_id = (SELECT id::text FROM public.profiles WHERE uid = '48413338');

-- ②.4 彻底删除 auth.users 中的 48413338
--     profiles.id 外键 ON DELETE CASCADE 会同步删除其 profile 行。
--     若此处因 Auth 子表外键报错，立即停止并反馈，不要自行删除 auth.identities。
DELETE FROM auth.users
WHERE id = (SELECT id FROM public.profiles WHERE uid = '48413338');


-- ③ 只读验证
-- ③.1 68436964 已就位且为 dev_admin / active（行应存在，role=dev_admin, account_status=active）
SELECT p.uid, p.id, p.role, p.account_status, u.email
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.uid = '68436964';

-- ③.2 48413338 在 profiles 中不存在（应返回 0；profiles.id 与 auth.users 级联，故也说明 auth.users 中无此行）
SELECT count(*) AS old_in_profiles FROM public.profiles WHERE uid = '48413338';

-- ③.3 （可选，用①.1 记录到的旧账号 email 复核 auth.users 已无该行；把 email 填入下列引号）
-- SELECT count(*) AS old_in_auth_users FROM auth.users WHERE email = '<48413338_对应的邮箱>';

-- ③.4 其他管理员未被修改（应仅剩预期的 dev_admin / admin）
SELECT p.uid, p.id, p.role, p.account_status, u.email
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('dev_admin','admin')
ORDER BY p.role, p.created_at;

-- ③.5 get_user_role 对 68436964 返回 dev_admin
SELECT public.get_user_role(id) AS role_68436964
FROM public.profiles
WHERE uid = '68436964';