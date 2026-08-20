ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS title VARCHAR(200) DEFAULT '';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS excerpt VARCHAR(300) DEFAULT '';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags VARCHAR(50)[] DEFAULT '{}';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_hot BOOLEAN DEFAULT false;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS favorites_count INTEGER DEFAULT 0;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE posts DROP COLUMN IF EXISTS category_id;

DROP INDEX IF EXISTS idx_posts_category_id;

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);

CREATE INDEX IF NOT EXISTS idx_posts_is_pinned ON posts(is_pinned);

CREATE INDEX IF NOT EXISTS idx_posts_is_deleted ON posts(is_deleted);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN(tags);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public posts are viewable by everyone" ON posts;

DROP POLICY IF EXISTS "Users can create posts" ON posts;

DROP POLICY IF EXISTS "Users can update their own posts" ON posts;

DROP POLICY IF EXISTS "Users can delete their own posts" ON posts;

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

ALTER FUNCTION increment_post_views(UUID) OWNER TO supabase_admin;