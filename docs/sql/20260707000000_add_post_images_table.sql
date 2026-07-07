-- 创建 post_images 表迁移
-- 创建日期: 2026-07-07
-- 作者: TRAE
-- 注意: Supabase SQL Editor 不支持事务块，已移除 BEGIN/COMMIT

CREATE TABLE IF NOT EXISTS post_images (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id);
CREATE INDEX IF NOT EXISTS idx_post_images_sort_order ON post_images(post_id, sort_order);

ALTER TABLE post_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view images of published posts" ON post_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_images.post_id 
        AND posts.is_deleted = false
    )
  );

CREATE POLICY "Users can insert their own post images" ON post_images
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_images.post_id 
        AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own post images" ON post_images
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_images.post_id 
        AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own post images" ON post_images
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM posts 
      WHERE posts.id = post_images.post_id 
        AND posts.user_id = auth.uid()
    )
  );