WITH admin_user AS (
  SELECT auth.admin.create_user(
    jsonb_build_object(
      'email', '10281028@campus-forum.local',
      'password', 'zyz10281028',
      'email_confirmed_at', NOW(),
      'user_metadata', jsonb_build_object(
        'uid', '10281028',
        'nickname', '管理员',
        'role', 'super_admin',
        'is_admin', true,
        'is_moderator', true,
        'is_vip', true,
        'avatar', 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin1028'
      )
    )
  ) AS user_id
)
INSERT INTO auth.audit_log_entries (
  instance_id,
  payload,
  created_at
) VALUES (
  (SELECT id FROM auth.instances LIMIT 1),
  jsonb_build_object(
    'action', 'create_admin_user',
    'admin_uid', '10281028',
    'role', 'super_admin',
    'description', '系统管理员账号初始化'
  ),
  NOW()
);

SELECT '管理员账号创建成功' AS result;