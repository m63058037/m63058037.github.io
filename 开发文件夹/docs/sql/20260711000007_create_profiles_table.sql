CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  nickname VARCHAR(100) NOT NULL DEFAULT '',
  avatar VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" 
  ON profiles FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" 
  ON profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);

INSERT INTO profiles (id, nickname, avatar, created_at)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'nickname', id::TEXT),
  raw_user_meta_data->>'avatar',
  created_at
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles);

SELECT 'Profiles table created successfully' AS result;