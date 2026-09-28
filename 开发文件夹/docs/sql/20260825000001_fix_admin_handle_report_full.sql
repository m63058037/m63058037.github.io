-- ============================================================
-- 幂等修复：admin_handle_report 完整业务闭环
-- 问题：举报「确认处理」后仅改状态并通知举报人，被举报帖子仍公开、帖子作者未收到警告。
-- 目标：单个数据库事务内完成：
--   1) 校验 admin/dev_admin（函数内，不依赖前端）
--   2) 锁定更新举报状态（仅处理 pending；handled→resolved，rejected→rejected）
--   3) handled 成立时：经 reports.target_id → posts.id 定位并软删除违规帖子（is_deleted=TRUE，保留审计）
--   4) handled 成立时：向被举报帖子作者发送违规内容处理通知（作者≠举报人时才发，避免重复）
--   5) 向举报人发送举报处理结果通知（成立时用固定文案，驳回时保留原备注文案）
-- 说明：plpgsql 函数体在单一事务内执行，任一步 RAISE EXCEPTION 会整体回滚，
--       因此不存在「前端显示成功、数据库只完成一部分」的半成功状态。
-- 安全：SECURITY DEFINER + search_path=public；权限校验 auth.uid() 角色。
-- 幂等：DROP IF EXISTS 后重建，可安全重复执行。
-- 注意：不自动执行，需人工在 Supabase SQL 中手动运行。
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_handle_report(
  p_report_id UUID,
  p_action VARCHAR,
  p_result TEXT
);

CREATE OR REPLACE FUNCTION public.admin_handle_report(
  p_report_id UUID,
  p_action VARCHAR, -- 'handled' 举报成立 / 'rejected' 驳回
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
  v_author_id UUID;
BEGIN
  v_role := public.get_user_role(v_admin_id);
  IF v_role NOT IN ('admin', 'dev_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_action NOT IN ('handled', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  -- 前端发送 'handled'，数据库 CHECK 约束允许的值为 'resolved'
  v_db_status := CASE WHEN p_action = 'handled' THEN 'resolved' ELSE 'rejected' END;

  -- 锁定举报并更新状态（仅待处理举报可处理），返回举报人与目标信息
  UPDATE public.reports
  SET status = v_db_status,
      handler_id = v_admin_id,
      handle_result = p_result,
      handled_at = NOW()
  WHERE id = p_report_id AND status = 'pending'
  RETURNING reporter_id, target_type, target_id
  INTO v_reporter_id, v_target_type, v_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already handled';
  END IF;

  -- 举报成立：软删除被举报帖子并警告作者
  IF p_action = 'handled' AND v_target_type = 'post' THEN
    -- 通过 reports.target_id 精确定位帖子（posts.id::text = target_id），不按标题/关键词
    SELECT user_id INTO v_author_id
    FROM public.posts
    WHERE id::text = v_target_id AND is_deleted = false;

    IF v_author_id IS NOT NULL THEN
      -- 软删除违规帖子（沿用 is_deleted 机制，保留记录用于管理员审计）
      UPDATE public.posts
      SET is_deleted = true
      WHERE id::text = v_target_id;

      -- 作者违规警告（作者与举报人相同时不重复发送，举报人已收到处理结果通知）
      IF v_reporter_id IS NULL OR v_author_id <> v_reporter_id THEN
        INSERT INTO public.system_messages (user_id, message_type, title, content, target_type, target_id)
        VALUES (
          v_author_id,
          'content_removed',
          '违规内容处理通知',
          '你发布的内容因违反社区内容规范，经管理员审核确认后已被移除。请注意遵守社区规则，避免再次发布违规内容。如你认为本次处理存在误判，可按照平台提供的申诉流程进行反馈。',
          'post',
          v_target_id
        );
      END IF;
    END IF;
  END IF;

  -- 通知举报人处理结果
  INSERT INTO public.system_messages (user_id, message_type, title, content, target_type, target_id)
  VALUES (
    v_reporter_id,
    'report_handled',
    '举报处理结果',
    CASE WHEN p_action = 'handled'
      THEN '你提交的举报已完成审核。经管理员核实，该内容存在违规问题，平台已对相关内容进行处理。感谢你对社区环境的维护与反馈。'
      ELSE '你提交的举报已完成审核。经管理员核实，举报内容未构成违规，平台已标记该举报为驳回。你的反馈仍有助于平台改进。'
    END,
    v_target_type,
    v_target_id
  );

  RETURN TRUE;
END;
$$;