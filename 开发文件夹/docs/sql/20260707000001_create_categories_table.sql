CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(order);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active categories" ON categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admin can insert categories" ON categories
  FOR INSERT TO authenticated USING (true);

CREATE POLICY "Admin can update categories" ON categories
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admin can delete categories" ON categories
  FOR DELETE TO authenticated USING (true);

INSERT INTO categories (id, name, slug, description, icon, "order", is_active) VALUES
  ('cat-001', '综合讨论', 'general', '校园热点话题、综合讨论区', 'forum', 1, true),
  ('cat-002', '学习交流', 'study', '学习资料分享、课程讨论', 'book', 2, true),
  ('cat-003', '校园生活', 'life', '校园日常、生活分享', 'home', 3, true),
  ('cat-004', '社团活动', 'club', '社团招新、活动通知', 'group', 4, true),
  ('cat-005', '二手交易', 'trade', '闲置物品、二手买卖', 'shopping', 5, true),
  ('cat-006', '问题求助', 'help', '遇到问题，寻求帮助', 'help', 6, true),
  ('cat-007', '其他', 'other', '其他话题', 'more', 99, true)
ON CONFLICT DO NOTHING;