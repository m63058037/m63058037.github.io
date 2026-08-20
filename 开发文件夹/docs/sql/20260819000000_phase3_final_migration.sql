-- ============================================================
-- 第三阶段「论坛核心」最终统一迁移文件（修正版 v4）
-- 创建日期: 2026-08-19
-- 说明: 将第三阶段所有数据库结构整合为一个幂等迁移文件
--       可在 Supabase SQL Editor 中直接执行，重复执行不会报错
-- 前置条件: posts 表已存在（第一/二阶段已创建）
--
-- 类型规则（基于实际数据库确认）:
--   posts.id        = VARCHAR  (不修改)
--   posts.user_id   = VARCHAR  (不修改)
--   auth.users.id   = UUID
--   profiles.id     = UUID
--   comments.post_id         = VARCHAR
--   comments.user_id          = UUID
--   post_likes.post_id        = VARCHAR
--   post_likes.user_id        = UUID
--   post_saves.post_id        = VARCHAR
--   post_saves.user_id        = UUID
--   reports.reporter_id       = UUID
--   reports.target_id         = VARCHAR
--
-- 比较规则:
--   UUID = UUID      → 不 cast（原生比较）
--   VARCHAR = VARCHAR → ::text 双向 cast（防止已存在表列类型为 UUID）
--   VARCHAR = UUID   → 双方 ::text cast
--   text = UUID       → UUID 侧 ::text cast
-- ============================================================

-- ============================================================
-- 0. 清理旧版 RPC 函数（可能存在 UUID 参数版本）
-- 防止函数重载导致调用到错误版本
-- ============================================================
DROP FUNCTION IF EXISTS public.increment_post_views(UUID);
DROP FUNCTION IF EXISTS public.update_post_likes_count(UUID);
DROP FUNCTION IF EXISTS public.update_post_comments_count(UUID);
DROP FUNCTION IF EXISTS public.update_post_favorites_count(UUID);
DROP FUNCTION IF EXISTS public.increment_post_views(VARCHAR);
DROP FUNCTION IF EXISTS public.update_post_likes_count(VARCHAR);
DROP FUNCTION IF EXISTS public.update_post_comments_count(VARCHAR);
DROP FUNCTION IF EXISTS public.update_post_favorites_count(VARCHAR);

-- ============================================================
-- 0.5 修复已存在表的列类型
-- 如果之前迁移创建了错误类型的列，CREATE TABLE IF NOT EXISTS 不会修正
-- 此段检测并修复列类型，使用 USING 子句保留数据值
-- 每个修复独立包裹在异常处理中，失败不会中断整体迁移
-- ============================================================

-- 0.5.1 修复 comments 表列类型
DO $$
BEGIN
  -- comments.post_id 应为 VARCHAR，如果实际是 UUID 则修正
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comments'
      AND column_name = 'post_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.comments ALTER COLUMN post_id TYPE VARCHAR USING post_id::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'comments.post_id type fix skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- comments.user_id 应为 UUID，如果实际不是 UUID 则修正
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comments'
      AND column_name = 'user_id' AND data_type != 'uuid'
  ) THEN
    ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
    ALTER TABLE public.comments ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;
    ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'comments.user_id type fix skipped: %', SQLERRM;
END $$;

-- 0.5.2 修复 post_likes 表列类型
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_likes'
      AND column_name = 'post_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.post_likes ALTER COLUMN post_id TYPE VARCHAR USING post_id::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'post_likes.post_id type fix skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_likes'
      AND column_name = 'user_id' AND data_type != 'uuid'
  ) THEN
    ALTER TABLE public.post_likes DROP CONSTRAINT IF EXISTS post_likes_user_id_fkey;
    ALTER TABLE public.post_likes ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;
    ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'post_likes.user_id type fix skipped: %', SQLERRM;
END $$;

-- 0.5.3 修复 post_saves 表列类型
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_saves'
      AND column_name = 'post_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.post_saves ALTER COLUMN post_id TYPE VARCHAR USING post_id::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'post_saves.post_id type fix skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_saves'
      AND column_name = 'user_id' AND data_type != 'uuid'
  ) THEN
    ALTER TABLE public.post_saves DROP CONSTRAINT IF EXISTS post_saves_user_id_fkey;
    ALTER TABLE public.post_saves ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;
    ALTER TABLE public.post_saves ADD CONSTRAINT post_saves_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'post_saves.user_id type fix skipped: %', SQLERRM;
END $$;

-- 0.5.4 修复 reports 表列类型
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports'
      AND column_name = 'reporter_id' AND data_type != 'uuid'
  ) THEN
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey;
    ALTER TABLE public.reports ALTER COLUMN reporter_id TYPE UUID USING reporter_id::text::uuid;
    ALTER TABLE public.reports ADD CONSTRAINT reports_reporter_id_fkey
      FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'reports.reporter_id type fix skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports'
      AND column_name = 'target_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.reports ALTER COLUMN target_id TYPE VARCHAR USING target_id::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'reports.target_id type fix skipped: %', SQLERRM;
END $$;

-- 0.5.5 修复 profiles 表 id 列类型
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'id' AND data_type != 'uuid'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
    ALTER TABLE public.profiles ALTER COLUMN id TYPE UUID USING id::text::uuid;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'profiles.id type fix skipped: %', SQLERRM;
END $$;

-- ============================================================
-- 1. profiles 表（用户资料，首页真实数据依赖此表）
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname VARCHAR(100) NOT NULL DEFAULT '',
  avatar VARCHAR(500) DEFAULT NULL,
  bio VARCHAR(200) DEFAULT '',
  signature VARCHAR(100) DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio VARCHAR(200) DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature VARCHAR(100) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- profiles.id 是 UUID，auth.uid() 是 UUID → UUID = UUID 不需要 cast
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 回填：为已有 auth.users 创建 profiles 记录
-- auth.users.id 是 UUID，profiles.id 是 UUID → 类型一致
INSERT INTO profiles (id, nickname, avatar, bio, signature, created_at, updated_at)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nickname', u.id::TEXT),
  COALESCE(u.raw_user_meta_data->>'avatar', NULL),
  COALESCE(u.raw_user_meta_data->>'bio', ''),
  COALESCE(u.raw_user_meta_data->>'signature', ''),
  u.created_at,
  u.created_at
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. 新用户注册时自动创建 profiles 记录的触发器
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, avatar, bio, signature, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nickname', NEW.id::TEXT),
    COALESCE(NEW.raw_user_meta_data->>'avatar', NULL),
    COALESCE(NEW.raw_user_meta_data->>'bio', ''),
    COALESCE(NEW.raw_user_meta_data->>'signature', ''),
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. comments 表（评论 + 回复）
-- post_id 使用 VARCHAR 以匹配实际 posts.id 类型
-- user_id 使用 UUID 以匹配 auth.users.id 类型
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comments' AND column_name = 'parent_comment_id'
  ) THEN
    ALTER TABLE comments ADD COLUMN parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- SELECT: 评论在未删除且帖子存在时可查看
-- posts.id 是 VARCHAR，comments.post_id 是 VARCHAR
-- 双方 ::text cast 确保即使已存在表的 post_id 为 UUID 也能正确比较
DROP POLICY IF EXISTS "Comments are viewable on published posts" ON comments;
CREATE POLICY "Comments are viewable on published posts"
  ON comments FOR SELECT
  USING (
    is_deleted = false AND
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id::text = comments.post_id::text
        AND posts.is_deleted = false
    )
  );

-- INSERT/UPDATE/DELETE: comments.user_id 是 UUID，auth.uid() 是 UUID → UUID = UUID
DROP POLICY IF EXISTS "Users can create own comments" ON comments;
CREATE POLICY "Users can create own comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 4. post_likes 表（点赞）
-- post_id 使用 VARCHAR，user_id 使用 UUID
-- ============================================================
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_likes_unique ON post_likes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- posts.id 是 VARCHAR，post_likes.post_id 是 VARCHAR → ::text 双向 cast
DROP POLICY IF EXISTS "Likes are viewable on published posts" ON post_likes;
CREATE POLICY "Likes are viewable on published posts"
  ON post_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id::text = post_likes.post_id::text
        AND posts.is_deleted = false
    )
  );

-- post_likes.user_id 是 UUID，auth.uid() 是 UUID → UUID = UUID
DROP POLICY IF EXISTS "Users can like posts" ON post_likes;
CREATE POLICY "Users can like posts"
  ON post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike own likes" ON post_likes;
CREATE POLICY "Users can unlike own likes"
  ON post_likes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. post_saves 表（收藏）
-- post_id 使用 VARCHAR，user_id 使用 UUID
-- ============================================================
CREATE TABLE IF NOT EXISTS post_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_saves_unique ON post_saves(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_post_saves_post_id ON post_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_post_saves_user_id ON post_saves(user_id);

ALTER TABLE post_saves ENABLE ROW LEVEL SECURITY;

-- posts.id 是 VARCHAR，post_saves.post_id 是 VARCHAR → ::text 双向 cast
DROP POLICY IF EXISTS "Saves are viewable on published posts" ON post_saves;
CREATE POLICY "Saves are viewable on published posts"
  ON post_saves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id::text = post_saves.post_id::text
        AND posts.is_deleted = false
    )
  );

-- post_saves.user_id 是 UUID，auth.uid() 是 UUID → UUID = UUID
DROP POLICY IF EXISTS "Users can save posts" ON post_saves;
CREATE POLICY "Users can save posts"
  ON post_saves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave own saves" ON post_saves;
CREATE POLICY "Users can unsave own saves"
  ON post_saves FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. reports 表（举报）
-- target_id 使用 VARCHAR 以兼容 posts.id（VARCHAR）
-- reporter_id 使用 UUID 以匹配 auth.users.id
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id VARCHAR NOT NULL,
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

-- reports.reporter_id 是 UUID，auth.uid() 是 UUID → UUID = UUID
DROP POLICY IF EXISTS "Users can view own reports" ON reports;
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can create own reports" ON reports;
CREATE POLICY "Users can create own reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- ============================================================
-- 7. RPC 函数
-- 所有参数使用 VARCHAR 以匹配实际 posts.id 类型
-- 所有 post_id 比较使用 ::text 统一为 text 比较
-- 设置 search_path 防止搜索路径操纵攻击
-- 限制执行权限：仅认证用户可调用
-- ============================================================

-- 7.1 帖子浏览量自增
-- posts.id 是 VARCHAR，p_post_id 是 VARCHAR → ::text 双向 cast
CREATE OR REPLACE FUNCTION public.increment_post_views(p_post_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE public.posts SET views_count = views_count + 1 WHERE id::text = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.increment_post_views(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_post_views(VARCHAR) TO authenticated;

-- 7.2 帖子点赞数更新
-- post_likes.post_id 是 VARCHAR，p_post_id 是 VARCHAR → ::text cast
-- posts.id 是 VARCHAR，p_post_id 是 VARCHAR → ::text cast
CREATE OR REPLACE FUNCTION public.update_post_likes_count(p_post_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE public.posts
  SET likes_count = (
    SELECT COUNT(*) FROM public.post_likes
    WHERE post_id::text = p_post_id
  )
  WHERE id::text = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.update_post_likes_count(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_post_likes_count(VARCHAR) TO authenticated;

-- 7.3 帖子评论数更新（含回复）
-- comments.post_id 是 VARCHAR，p_post_id 是 VARCHAR → ::text cast
-- posts.id 是 VARCHAR，p_post_id 是 VARCHAR → ::text cast
CREATE OR REPLACE FUNCTION public.update_post_comments_count(p_post_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE public.posts
  SET comments_count = (
    SELECT COUNT(*) FROM public.comments
    WHERE post_id::text = p_post_id AND is_deleted = false
  )
  WHERE id::text = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.update_post_comments_count(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_post_comments_count(VARCHAR) TO authenticated;

-- 7.4 帖子收藏数更新
-- post_saves.post_id 是 VARCHAR，p_post_id 是 VARCHAR → ::text cast
-- posts.id 是 VARCHAR，p_post_id 是 VARCHAR → ::text cast
CREATE OR REPLACE FUNCTION public.update_post_favorites_count(p_post_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE public.posts
  SET favorites_count = (
    SELECT COUNT(*) FROM public.post_saves
    WHERE post_id::text = p_post_id
  )
  WHERE id::text = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.update_post_favorites_count(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_post_favorites_count(VARCHAR) TO authenticated;

-- ============================================================
-- 8. updated_at 自动更新触发器
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_comments_updated_at ON comments;
CREATE TRIGGER trigger_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_reports_updated_at ON reports;
CREATE TRIGGER trigger_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9. Storage 存储桶和策略（最小权限原则）
-- 9.1 avatars: 文件路径 {user_id}/{filename}
-- 9.2 post-images: 文件路径 {post_id}/{filename}
-- ============================================================

-- 9.1 头像存储桶
INSERT INTO storage.buckets (id, name, public)
SELECT 'avatars', 'avatars', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars');

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- split_part 返回 text，auth.uid() 返回 UUID
-- text = UUID 会导致 "operator does not exist: text = uuid"
-- 修复：auth.uid()::text 将 UUID 转为 text → text = text
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    split_part(name, '/', 1) = auth.uid()::text
  );

-- 9.2 帖子图片存储桶
INSERT INTO storage.buckets (id, name, public)
SELECT 'post-images', 'post-images', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'post-images');

DROP POLICY IF EXISTS "Public read post images" ON storage.objects;
CREATE POLICY "Public read post images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

-- 关键类型冲突修复：
-- posts.id 是 VARCHAR，split_part 返回 text → VARCHAR::text = text → text = text ✅
-- posts.user_id 是 VARCHAR，auth.uid() 返回 UUID → VARCHAR = UUID 会导致 "text = uuid" 错误
-- 修复：双方都 ::text cast → text = text ✅
DROP POLICY IF EXISTS "Users upload own post images" ON storage.objects;
CREATE POLICY "Users upload own post images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id::text = split_part(name, '/', 1)
        AND posts.user_id::text = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users update own post images" ON storage.objects;
CREATE POLICY "Users update own post images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'post-images' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id::text = split_part(name, '/', 1)
        AND posts.user_id::text = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users delete own post images" ON storage.objects;
CREATE POLICY "Users delete own post images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-images' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id::text = split_part(name, '/', 1)
        AND posts.user_id::text = auth.uid()::text
    )
  );

-- ============================================================
-- 10. 完成
-- ============================================================
SELECT 'Phase 3 final migration v4 applied successfully' AS result;
