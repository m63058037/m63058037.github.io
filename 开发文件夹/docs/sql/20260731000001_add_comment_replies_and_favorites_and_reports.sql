-- 第三阶段功能补充迁移
-- 创建日期: 2026-07-31
-- 说明: 添加评论回复、收藏、举报功能所需的数据库结构

BEGIN;

-- 1. 为 comments 表添加 parent_comment_id 字段，支持评论回复
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);

-- 更新评论数量计算函数，计算所有评论（包括回复）
CREATE OR REPLACE FUNCTION update_post_comments_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts 
  SET comments_count = (
    SELECT COUNT(*) FROM comments 
    WHERE post_id = p_post_id AND is_deleted = false
  )
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 创建 post_saves 表（收藏功能）
CREATE TABLE IF NOT EXISTS post_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_saves_post_id ON post_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_post_saves_user_id ON post_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_post_saves_unique ON post_saves(post_id, user_id);

ALTER TABLE post_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view saves" ON post_saves;
CREATE POLICY "Users can view saves" ON post_saves
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_saves.post_id 
        AND posts.is_deleted = false
    )
  );

DROP POLICY IF EXISTS "Users can save posts" ON post_saves;
CREATE POLICY "Users can save posts" ON post_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave their own saves" ON post_saves;
CREATE POLICY "Users can unsave their own saves" ON post_saves
  FOR DELETE USING (auth.uid() = user_id);

-- 创建收藏数量更新函数
CREATE OR REPLACE FUNCTION update_post_favorites_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts 
  SET favorites_count = (
    SELECT COUNT(*) FROM post_saves 
    WHERE post_id = p_post_id
  )
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 创建 reports 表（举报功能）
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id UUID NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  content TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'resolved', 'rejected')),
  admin_note TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own reports" ON reports;
CREATE POLICY "Users can view their own reports" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can create reports" ON reports;
CREATE POLICY "Users can create reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

COMMIT;

SELECT 'Phase 3 migration completed successfully' AS result;
