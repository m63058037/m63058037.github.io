-- ============================================================
-- 第三阶段收尾：帖子校区发布范围 — post_branches 表 + RLS
-- 创建日期: 2026-08-20
-- 说明: 支持帖子发布到多个校区（自己的校区 + all）
-- 前置条件: 20260819000000_phase3_final_migration.sql
--           20260820000000_registration_system_refactor.sql 已执行
-- 幂等: 可重复执行，不会报错
-- 安全: 不修改现有表结构，不删除现有数据
--       不使用 service_role key，不使用管理员 API
--       所有 SECURITY DEFINER 函数设置 SET search_path = public
-- ============================================================

-- ============================================================
-- 1. post_branches 表（帖子-校区关联）
-- post_id 使用 VARCHAR 以匹配实际 posts.id 类型
-- branch 使用 VARCHAR 存储校区名称或 'all'
-- 一个帖子可以有多条记录，实现"水荫路校区 + all"的组合
-- ============================================================

CREATE TABLE IF NOT EXISTS public.post_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR NOT NULL,
  branch VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 唯一约束：同一个帖子不能重复关联同一个校区
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_branches_unique ON public.post_branches(post_id, branch);

-- 查询索引
CREATE INDEX IF NOT EXISTS idx_post_branches_post_id ON public.post_branches(post_id);
CREATE INDEX IF NOT EXISTS idx_post_branches_branch ON public.post_branches(branch);
CREATE INDEX IF NOT EXISTS idx_post_branches_created_at ON public.post_branches(created_at);

ALTER TABLE public.post_branches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. RLS 策略
-- ============================================================

-- 2.1 SELECT: 校区关联在帖子存在且未删除时可查看
-- posts.id 是 VARCHAR，post_branches.post_id 是 VARCHAR → ::text 双向 cast
DROP POLICY IF EXISTS "Post branches are viewable on published posts" ON public.post_branches;
CREATE POLICY "Post branches are viewable on published posts"
  ON public.post_branches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id::text = post_branches.post_id::text
        AND posts.is_deleted = false
    )
  );

-- 2.2 INSERT: 只有帖子作者可以添加校区关联
-- 且只能添加 'all' 或自己所属的校区
-- 这是核心安全策略：防止用户发布到其他校区
DROP POLICY IF EXISTS "Users can insert branches for own posts" ON public.post_branches;
CREATE POLICY "Users can insert branches for own posts"
  ON public.post_branches FOR INSERT
  WITH CHECK (
    -- 必须是帖子作者
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id::text = post_branches.post_id::text
        AND posts.user_id::text = auth.uid()::text
    )
    -- branch 必须是 'all' 或用户自己的校区
    AND (
      post_branches.branch = 'all'
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.branch = post_branches.branch
      )
    )
  );

-- 2.3 DELETE: 只有帖子作者可以删除校区关联
DROP POLICY IF EXISTS "Users can delete branches for own posts" ON public.post_branches;
CREATE POLICY "Users can delete branches for own posts"
  ON public.post_branches FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id::text = post_branches.post_id::text
        AND posts.user_id::text = auth.uid()::text
    )
  );

-- ============================================================
-- 3. RPC 函数：批量替换帖子的校区关联
-- 用于发帖和编辑帖子时设置校区范围
-- 安全保障：函数内部验证 branch 必须是 'all' 或用户自己的校区
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_post_branches(
  p_post_id VARCHAR,
  p_branches TEXT[]
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_user_branch VARCHAR;
  v_branch TEXT;
  v_is_valid BOOLEAN;
BEGIN
  -- 获取帖子作者
  SELECT user_id INTO v_user_id FROM public.posts WHERE id::text = p_post_id::text;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '帖子不存在';
  END IF;

  -- 验证调用者是帖子作者
  IF auth.uid() IS NULL OR auth.uid()::text != v_user_id::text THEN
    RAISE EXCEPTION '无权修改此帖子的校区范围';
  END IF;

  -- 获取用户自己的校区
  SELECT branch INTO v_user_branch FROM public.profiles WHERE id = auth.uid();

  -- 验证所有 branch 合法性
  v_is_valid := TRUE;
  IF p_branches IS NOT NULL THEN
    FOREACH v_branch IN ARRAY p_branches LOOP
      IF v_branch != 'all' AND v_branch IS DISTINCT FROM v_user_branch THEN
        v_is_valid := FALSE;
      END IF;
    END LOOP;
  END IF;

  IF NOT v_is_valid THEN
    RAISE EXCEPTION '校区范围只能选择自己的校区或全部校区';
  END IF;

  -- 删除旧的校区关联
  DELETE FROM public.post_branches WHERE post_id::text = p_post_id::text;

  -- 插入新的校区关联
  IF p_branches IS NOT NULL THEN
    FOREACH v_branch IN ARRAY p_branches LOOP
      INSERT INTO public.post_branches (post_id, branch)
      VALUES (p_post_id, v_branch);
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.set_post_branches(VARCHAR, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_post_branches(VARCHAR, TEXT[]) TO authenticated;

-- ============================================================
-- 4. RPC 函数：获取帖子的校区列表
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_post_branches(
  p_post_id VARCHAR
)
RETURNS TABLE(branch VARCHAR)
AS $$
BEGIN
  RETURN QUERY
  SELECT pb.branch::VARCHAR FROM public.post_branches pb
  WHERE pb.post_id::text = p_post_id::text
  ORDER BY pb.branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_post_branches(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_branches(VARCHAR) TO authenticated;

-- ============================================================
-- 5. RPC 函数：按校区分页获取帖子 ID 列表
-- 用于首页无限滚动 + 校区筛选
-- p_branch = 'all' 时只返回 branch='all' 的帖子
-- p_branch = 具体校区名时返回该校区的帖子
-- 返回帖子 ID 数组和是否有更多数据
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_posts_by_branch(
  p_branch VARCHAR,
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  post_id VARCHAR,
  total_count BIGINT
)
AS $$
BEGIN
  RETURN QUERY
  WITH matched_posts AS (
    SELECT DISTINCT p.id, p.is_pinned, p.is_hot, p.created_at
    FROM public.posts p
    INNER JOIN public.post_branches pb ON p.id::text = pb.post_id::text
    WHERE p.is_deleted = false
      AND pb.branch = p_branch
  ),
  total AS (
    SELECT COUNT(*) AS cnt FROM matched_posts
  )
  SELECT mp.id::VARCHAR, total.cnt
  FROM matched_posts mp, total
  ORDER BY mp.is_pinned DESC, mp.is_hot DESC, mp.created_at DESC
  OFFSET p_offset LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_posts_by_branch(VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_posts_by_branch(VARCHAR, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 6. RPC 函数：获取热门帖子（按校区）
-- 返回最多 p_limit 条 is_hot=true 的帖子
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_hot_posts_by_branch(
  p_branch VARCHAR,
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE(post_id VARCHAR)
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id::VARCHAR
  FROM public.posts p
  INNER JOIN public.post_branches pb ON p.id::text = pb.post_id::text
  WHERE p.is_deleted = false
    AND p.is_hot = true
    AND pb.branch = p_branch
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_hot_posts_by_branch(VARCHAR, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hot_posts_by_branch(VARCHAR, INTEGER) TO authenticated;

-- ============================================================
-- 7. RPC 函数：获取统计数据
-- 返回总帖子数、总评论数、总用户数
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_forum_stats()
RETURNS TABLE(
  total_posts BIGINT,
  total_comments BIGINT,
  total_users BIGINT
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.posts WHERE is_deleted = false)::BIGINT,
    (SELECT COUNT(*) FROM public.comments WHERE is_deleted = false)::BIGINT,
    (SELECT COUNT(*) FROM public.profiles)::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_forum_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_forum_stats() TO authenticated;

-- ============================================================
-- 8. RPC 函数：获取最新评论（带帖子标题）
-- 用于首页右侧最新回复
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_latest_comments(
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
  comment_id UUID,
  post_id VARCHAR,
  post_title VARCHAR,
  content TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ
)
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.post_id::VARCHAR, p.title::VARCHAR, c.content, c.user_id, c.created_at
  FROM public.comments c
  INNER JOIN public.posts p ON p.id::text = c.post_id::text
  WHERE c.is_deleted = false AND p.is_deleted = false
  ORDER BY c.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_latest_comments(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_comments(INTEGER) TO authenticated;

-- ============================================================
-- 9. 完成
-- ============================================================

SELECT 'Post branches migration applied successfully' AS result;
