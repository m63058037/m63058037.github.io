DROP TABLE IF EXISTS post_images;

DROP TABLE IF EXISTS posts;

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  excerpt VARCHAR(300),
  tags VARCHAR(50)[],
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_hot BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  favorites_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_is_pinned ON posts(is_pinned);
CREATE INDEX idx_posts_is_deleted ON posts(is_deleted);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public posts are viewable by everyone" ON posts
  FOR SELECT USING (is_deleted = false);

CREATE POLICY "Users can create posts" ON posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts" ON posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts" ON posts
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION increment_post_views(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET views_count = views_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE post_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_post_images_post_id ON post_images(post_id);
CREATE INDEX idx_post_images_sort_order ON post_images(post_id, sort_order);

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

SELECT 'Posts tables rebuilt successfully' AS result;