# 校园论坛数据库设计文档

## 一、数据库概述

本项目使用 Supabase PostgreSQL 作为数据库，包含以下核心表：

| 表名 | 说明 |
|------|------|
| `users` | 用户基础信息（由 Supabase Auth 自动创建） |
| `profiles` | 用户详细资料 |
| `posts` | 帖子 |
| `comments` | 评论 |
| `likes` | 点赞记录 |
| `favorites` | 收藏记录 |
| `categories` | 板块分类 |
| `notifications` | 通知 |
| `reports` | 举报记录 |
| `admin_logs` | 管理员操作日志 |

---

## 二、表结构设计

### 2.1 profiles 表（用户详细资料）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, REFERENCES users(id) | 用户ID（与 Auth 用户ID关联） |
| `nickname` | `varchar(50)` | NOT NULL | 昵称 |
| `avatar` | `varchar(255)` | | 头像URL |
| `role` | `varchar(20)` | NOT NULL, DEFAULT 'user' | 角色：guest/user/vip/moderator/admin/super_admin |
| `is_admin` | `boolean` | NOT NULL, DEFAULT false | 是否管理员 |
| `is_moderator` | `boolean` | NOT NULL, DEFAULT false | 是否版主 |
| `is_vip` | `boolean` | NOT NULL, DEFAULT false | 是否VIP |
| `bio` | `text` | | 个人简介 |
| `school` | `varchar(100)` | | 学校 |
| `department` | `varchar(100)` | | 院系 |
| `student_id` | `varchar(20)` | UNIQUE | 学号 |
| `phone` | `varchar(20)` | | 手机号 |
| `gender` | `varchar(10)` | | 性别 |
| `birthday` | `date` | | 生日 |
| `location` | `varchar(100)` | | 所在地 |
| `website` | `varchar(255)` | | 个人网站 |
| `github` | `varchar(100)` | | GitHub |
| `wechat` | `varchar(50)` | | 微信号 |
| `posts_count` | `integer` | NOT NULL, DEFAULT 0 | 发帖数 |
| `comments_count` | `integer` | NOT NULL, DEFAULT 0 | 评论数 |
| `likes_count` | `integer` | NOT NULL, DEFAULT 0 | 获赞数 |
| `favorites_count` | `integer` | NOT NULL, DEFAULT 0 | 收藏数 |
| `following_count` | `integer` | NOT NULL, DEFAULT 0 | 关注数 |
| `followers_count` | `integer` | NOT NULL, DEFAULT 0 | 粉丝数 |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 更新时间 |

**索引**:
- `idx_profiles_nickname` ON profiles(nickname)
- `idx_profiles_student_id` ON profiles(student_id)
- `idx_profiles_role` ON profiles(role)

**RLS策略**:
- 用户只能查看所有用户的公开信息
- 用户只能修改自己的资料
- 管理员可以查看和修改所有用户资料

**数据迁移规划**:

当前用户资料（昵称、头像、简介、签名）暂时存储在 Supabase Auth 的 user_metadata 中。

后续将迁移至独立的 profiles 数据表，迁移计划如下：

1. 创建 profiles 数据表（已在设计中）
2. 编写迁移脚本，将 Auth Metadata 中的数据同步至 profiles 表
3. 修改所有读取用户资料的代码，从 profiles 表读取
4. 修改所有更新用户资料的代码，写入 profiles 表
5. 保留 Auth Metadata 作为临时缓存，逐步清理

未来用户主页、搜索、排行榜等功能将统一从 profiles 表读取数据。

---

### 2.2 categories 表（板块分类）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 分类ID |
| `name` | `varchar(50)` | NOT NULL, UNIQUE | 分类名称 |
| `slug` | `varchar(50)` | NOT NULL, UNIQUE | 分类别名（URL友好） |
| `description` | `text` | | 分类描述 |
| `icon` | `varchar(100)` | | 图标名称（Material Symbols） |
| `color` | `varchar(7)` | DEFAULT '#6200EE' | 主题色 |
| `order` | `integer` | NOT NULL, DEFAULT 0 | 排序顺序 |
| `posts_count` | `integer` | NOT NULL, DEFAULT 0 | 帖子数 |
| `is_active` | `boolean` | NOT NULL, DEFAULT true | 是否启用 |
| `is_default` | `boolean` | NOT NULL, DEFAULT false | 是否默认分类 |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 更新时间 |

**索引**:
- `idx_categories_slug` ON categories(slug)
- `idx_categories_order` ON categories(order)
- `idx_categories_is_active` ON categories(is_active)

**RLS策略**:
- 所有用户可以查看启用的分类
- 只有管理员可以创建、修改、删除分类

---

### 2.3 posts 表（帖子）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 帖子ID |
| `user_id` | `uuid` | NOT NULL, REFERENCES profiles(id) | 作者ID |
| `category_id` | `uuid` | REFERENCES categories(id) | 分类ID |
| `title` | `varchar(200)` | NOT NULL | 标题 |
| `content` | `text` | NOT NULL | 内容（支持Markdown） |
| `excerpt` | `varchar(300)` | | 摘要 |
| `tags` | `varchar(50)[]` | | 标签数组 |
| `is_pinned` | `boolean` | NOT NULL, DEFAULT false | 是否置顶 |
| `is_hot` | `boolean` | NOT NULL, DEFAULT false | 是否热门 |
| `is_locked` | `boolean` | NOT NULL, DEFAULT false | 是否锁定 |
| `is_deleted` | `boolean` | NOT NULL, DEFAULT false | 是否删除 |
| `views_count` | `integer` | NOT NULL, DEFAULT 0 | 浏览数 |
| `likes_count` | `integer` | NOT NULL, DEFAULT 0 | 点赞数 |
| `comments_count` | `integer` | NOT NULL, DEFAULT 0 | 评论数 |
| `favorites_count` | `integer` | NOT NULL, DEFAULT 0 | 收藏数 |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 更新时间 |

**索引**:
- `idx_posts_user_id` ON posts(user_id)
- `idx_posts_category_id` ON posts(category_id)
- `idx_posts_is_pinned` ON posts(is_pinned)
- `idx_posts_is_deleted` ON posts(is_deleted)
- `idx_posts_created_at` ON posts(created_at)
- `idx_posts_tags` ON posts USING GIN(tags)

**RLS策略**:
- 所有用户可以查看未删除的帖子
- 用户只能修改和删除自己的帖子
- 管理员可以修改和删除所有帖子
- 版主可以修改和删除本板块的帖子

---

### 2.4 post_images 表（帖子图片关联）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `varchar` | PRIMARY KEY, DEFAULT gen_random_uuid() | 图片ID |
| `post_id` | `varchar` | NOT NULL, REFERENCES posts(id) ON DELETE CASCADE | 帖子ID |
| `url` | `text` | NOT NULL | 图片URL（Supabase Storage） |
| `path` | `text` | NOT NULL | 图片存储路径 |
| `file_name` | `text` | NOT NULL | 文件名 |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 | 排序顺序 |
| `created_at` | `timestamp with time zone` | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引**:
- `idx_post_images_post_id` ON post_images(post_id)
- `idx_post_images_sort_order` ON post_images(post_id, sort_order)

**RLS策略**:
- 所有用户可以查看未删除帖子的图片
- 用户只能添加、修改、删除自己帖子的图片
- 管理员可以管理所有图片

---

### 2.5 comments 表（评论）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 评论ID |
| `post_id` | `uuid` | NOT NULL, REFERENCES posts(id) | 帖子ID |
| `user_id` | `uuid` | NOT NULL, REFERENCES profiles(id) | 评论者ID |
| `parent_id` | `uuid` | REFERENCES comments(id) | 父评论ID（回复） |
| `content` | `text` | NOT NULL | 评论内容 |
| `is_deleted` | `boolean` | NOT NULL, DEFAULT false | 是否删除 |
| `likes_count` | `integer` | NOT NULL, DEFAULT 0 | 点赞数 |
| `replies_count` | `integer` | NOT NULL, DEFAULT 0 | 回复数 |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |
| `updated_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 更新时间 |

**索引**:
- `idx_comments_post_id` ON comments(post_id)
- `idx_comments_user_id` ON comments(user_id)
- `idx_comments_parent_id` ON comments(parent_id)
- `idx_comments_is_deleted` ON comments(is_deleted)
- `idx_comments_created_at` ON comments(created_at)

**RLS策略**:
- 所有用户可以查看未删除的评论
- 用户只能修改和删除自己的评论
- 管理员可以修改和删除所有评论
- 版主可以修改和删除本板块帖子的评论

---

### 2.6 likes 表（点赞记录）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 点赞ID |
| `user_id` | `uuid` | NOT NULL, REFERENCES profiles(id) | 用户ID |
| `post_id` | `uuid` | REFERENCES posts(id) | 帖子ID（与comment_id二选一） |
| `comment_id` | `uuid` | REFERENCES comments(id) | 评论ID（与post_id二选一） |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `idx_likes_user_id` ON likes(user_id)
- `idx_likes_post_id` ON likes(post_id)
- `idx_likes_comment_id` ON likes(comment_id)

**唯一约束**:
- `uq_likes_user_post` (user_id, post_id) - 同一用户对同一帖子只能点赞一次
- `uq_likes_user_comment` (user_id, comment_id) - 同一用户对同一评论只能点赞一次

**RLS策略**:
- 用户可以查看自己的点赞记录
- 用户可以创建和删除自己的点赞记录
- 管理员可以查看所有点赞记录

---

### 2.7 favorites 表（收藏记录）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 收藏ID |
| `user_id` | `uuid` | NOT NULL, REFERENCES profiles(id) | 用户ID |
| `post_id` | `uuid` | NOT NULL, REFERENCES posts(id) | 帖子ID |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `idx_favorites_user_id` ON favorites(user_id)
- `idx_favorites_post_id` ON favorites(post_id)

**唯一约束**:
- `uq_favorites_user_post` (user_id, post_id) - 同一用户对同一帖子只能收藏一次

**RLS策略**:
- 用户可以查看自己的收藏记录
- 用户可以创建和删除自己的收藏记录
- 管理员可以查看所有收藏记录

---

### 2.8 notifications 表（通知）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 通知ID |
| `user_id` | `uuid` | NOT NULL, REFERENCES profiles(id) | 接收用户ID |
| `type` | `varchar(50)` | NOT NULL | 通知类型：like/comment/follow/system/mention |
| `related_user_id` | `uuid` | REFERENCES profiles(id) | 相关用户ID |
| `related_post_id` | `uuid` | REFERENCES posts(id) | 相关帖子ID |
| `related_comment_id` | `uuid` | REFERENCES comments(id) | 相关评论ID |
| `content` | `text` | | 通知内容 |
| `is_read` | `boolean` | NOT NULL, DEFAULT false | 是否已读 |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `idx_notifications_user_id` ON notifications(user_id)
- `idx_notifications_is_read` ON notifications(is_read)
- `idx_notifications_created_at` ON notifications(created_at)

**RLS策略**:
- 用户只能查看自己的通知
- 用户可以更新自己通知的已读状态
- 管理员可以查看和管理所有通知

---

### 2.9 reports 表（举报记录）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 举报ID |
| `user_id` | `uuid` | NOT NULL, REFERENCES profiles(id) | 举报人ID |
| `target_type` | `varchar(20)` | NOT NULL | 举报类型：post/comment/user |
| `target_id` | `uuid` | NOT NULL | 被举报对象ID |
| `reason` | `varchar(200)` | NOT NULL | 举报原因 |
| `detail` | `text` | | 详细说明 |
| `status` | `varchar(20)` | NOT NULL, DEFAULT 'pending' | 状态：pending/approved/rejected |
| `processed_by` | `uuid` | REFERENCES profiles(id) | 处理人ID |
| `processed_at` | `timestamp with time zone` | | 处理时间 |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `idx_reports_user_id` ON reports(user_id)
- `idx_reports_target` ON reports(target_type, target_id)
- `idx_reports_status` ON reports(status)
- `idx_reports_created_at` ON reports(created_at)

**RLS策略**:
- 用户可以查看自己的举报记录
- 用户可以创建举报记录
- 管理员可以查看和处理所有举报记录

---

### 2.9 admin_logs 表（管理员操作日志）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT uuid_generate_v4() | 日志ID |
| `admin_id` | `uuid` | NOT NULL, REFERENCES profiles(id) | 管理员ID |
| `action` | `varchar(100)` | NOT NULL | 操作类型：create/update/delete/ban/mute/approve/reject |
| `target_type` | `varchar(20)` | NOT NULL | 操作对象类型：user/post/comment/category/report |
| `target_id` | `uuid` | | 操作对象ID |
| `target_name` | `varchar(200)` | | 操作对象名称 |
| `detail` | `text` | | 操作详情 |
| `ip_address` | `varchar(50)` | | IP地址 |
| `user_agent` | `text` | | 用户代理 |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | 创建时间 |

**索引**:
- `idx_admin_logs_admin_id` ON admin_logs(admin_id)
- `idx_admin_logs_action` ON admin_logs(action)
- `idx_admin_logs_target` ON admin_logs(target_type, target_id)
- `idx_admin_logs_created_at` ON admin_logs(created_at)

**RLS策略**:
- 只有超级管理员可以查看所有管理员日志
- 管理员可以查看自己的操作日志

---

## 三、ER图

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │  profiles   │       │ categories  │
│ (Auth)      │       │             │       │             │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │ 1:1                 │                     │
       └─────────────────────┤                     │
                             │ 1:N                 │ 1:N
                             ▼                     ▼
                        ┌─────────────┐       ┌─────────────┐
                        │    posts    │◄──────│  categories │
                        │             │       └─────────────┘
                        └──────┬──────┘
                               │ 1:N
                               ▼
                        ┌─────────────┐
                        │  comments   │
                        └──────┬──────┘
                               │ 1:N (self)
                               └─────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    likes    │       │  favorites  │       │notifications│
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │ N:1                 │ N:1                 │ N:1
       ├─── posts           ├─── posts           ├─── posts
       └─── comments         └─── user            ├─── comments
                                                   └─── users

┌─────────────┐       ┌─────────────┐
│   reports   │       │ admin_logs  │
└─────────────┘       └─────────────┘
```

---

## 四、索引设计

### 4.1 主键索引（自动创建）

所有表的 `id` 字段为 PRIMARY KEY，自动创建 B-tree 索引。

### 4.2 外键索引

| 表名 | 字段 | 索引类型 | 说明 |
|------|------|----------|------|
| profiles | id | B-tree | 关联 users(id) |
| posts | user_id | B-tree | 快速查询用户帖子 |
| posts | category_id | B-tree | 快速查询分类帖子 |
| comments | post_id | B-tree | 快速查询帖子评论 |
| comments | user_id | B-tree | 快速查询用户评论 |
| comments | parent_id | B-tree | 快速查询回复 |
| likes | user_id | B-tree | 快速查询用户点赞 |
| likes | post_id | B-tree | 快速查询帖子点赞 |
| likes | comment_id | B-tree | 快速查询评论点赞 |
| favorites | user_id | B-tree | 快速查询用户收藏 |
| favorites | post_id | B-tree | 快速查询帖子收藏 |
| notifications | user_id | B-tree | 快速查询用户通知 |
| reports | user_id | B-tree | 快速查询用户举报 |
| admin_logs | admin_id | B-tree | 快速查询管理员日志 |

### 4.3 功能索引

| 表名 | 字段 | 索引类型 | 说明 |
|------|------|----------|------|
| posts | tags | GIN | 支持标签数组查询 |
| posts | is_deleted, created_at | B-tree | 分页查询未删除帖子 |
| posts | is_pinned, created_at | B-tree | 置顶帖子排序 |
| comments | is_deleted, created_at | B-tree | 分页查询未删除评论 |
| notifications | is_read, created_at | B-tree | 未读通知排序 |
| reports | status, created_at | B-tree | 举报状态筛选 |

---

## 五、RLS策略汇总

### 5.1 profiles 表

```sql
-- 允许所有用户查看公开资料
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT USING (true);

-- 用户只能修改自己的资料
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE USING (auth.uid() = id);

-- 管理员可以管理所有资料
CREATE POLICY "Admins can manage all profiles"
ON profiles FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  )
);
```

### 5.2 posts 表

```sql
-- 允许所有用户查看未删除的帖子
CREATE POLICY "Public posts are viewable by everyone"
ON posts FOR SELECT USING (is_deleted = false);

-- 用户可以创建帖子
CREATE POLICY "Users can create posts"
ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户可以修改自己的帖子
CREATE POLICY "Users can update their own posts"
ON posts FOR UPDATE USING (auth.uid() = user_id);

-- 用户可以删除自己的帖子（软删除）
CREATE POLICY "Users can delete their own posts"
ON posts FOR UPDATE USING (auth.uid() = user_id);

-- 管理员可以管理所有帖子
CREATE POLICY "Admins can manage all posts"
ON posts FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  )
);
```

### 5.3 comments 表

```sql
-- 允许所有用户查看未删除的评论
CREATE POLICY "Public comments are viewable by everyone"
ON comments FOR SELECT USING (is_deleted = false);

-- 用户可以创建评论
CREATE POLICY "Users can create comments"
ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户可以修改自己的评论
CREATE POLICY "Users can update their own comments"
ON comments FOR UPDATE USING (auth.uid() = user_id);

-- 用户可以删除自己的评论（软删除）
CREATE POLICY "Users can delete their own comments"
ON comments FOR UPDATE USING (auth.uid() = user_id);

-- 管理员可以管理所有评论
CREATE POLICY "Admins can manage all comments"
ON comments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  )
);
```

---

## 六、数据完整性

### 6.1 外键约束

- `profiles.id` → `users.id` (CASCADE)
- `posts.user_id` → `profiles.id` (CASCADE)
- `posts.category_id` → `categories.id` (SET NULL)
- `comments.post_id` → `posts.id` (CASCADE)
- `comments.user_id` → `profiles.id` (CASCADE)
- `comments.parent_id` → `comments.id` (SET NULL)
- `likes.user_id` → `profiles.id` (CASCADE)
- `likes.post_id` → `posts.id` (CASCADE)
- `likes.comment_id` → `comments.id` (CASCADE)
- `favorites.user_id` → `profiles.id` (CASCADE)
- `favorites.post_id` → `posts.id` (CASCADE)
- `notifications.user_id` → `profiles.id` (CASCADE)
- `notifications.related_user_id` → `profiles.id` (SET NULL)
- `notifications.related_post_id` → `posts.id` (SET NULL)
- `notifications.related_comment_id` → `comments.id` (SET NULL)
- `reports.user_id` → `profiles.id` (CASCADE)
- `reports.processed_by` → `profiles.id` (SET NULL)
- `admin_logs.admin_id` → `profiles.id` (CASCADE)

### 6.2 唯一约束

| 表名 | 约束字段 | 说明 |
|------|----------|------|
| profiles | student_id | 学号唯一 |
| categories | name | 分类名称唯一 |
| categories | slug | 分类别名唯一 |
| likes | (user_id, post_id) | 同一用户对同一帖子只能点赞一次 |
| likes | (user_id, comment_id) | 同一用户对同一评论只能点赞一次 |
| favorites | (user_id, post_id) | 同一用户对同一帖子只能收藏一次 |

---

## 七、数据库初始化数据

### 7.1 初始分类数据

| name | slug | description | icon | color | order |
|------|------|-------------|------|-------|-------|
| 校园公告 | campus-news | 学校官方通知和公告 | `campus` | `#6200EE` | 1 |
| 学术交流 | academic | 学术讨论、论文分享 | `book` | `#03DAC6` | 2 |
| 求职招聘 | job | 实习、校招、社招信息 | `briefcase` | `#FF5722` | 3 |
| 二手交易 | secondhand | 二手物品买卖交换 | `shopping_bag` | `#4CAF50` | 4 |
| 失物招领 | lost-found | 失物招领、寻物启事 | `help` | `#FFC107` | 5 |
| 活动召集 | activities | 校园活动、社团招新 | `calendar` | `#9C27B0` | 6 |
| 吐槽灌水 | casual | 闲聊、吐槽、灌水 | `chat` | `#E91E63` | 7 |
| 技术分享 | tech | 技术交流、编程分享 | `code` | `#2196F3` | 8 |

### 7.2 初始管理员

| id | email | nickname | role |
|----|-------|----------|------|
| `10281028` | admin@example.com | 管理员 | super_admin |

---

## 八、版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-05 | 初始数据库设计 |