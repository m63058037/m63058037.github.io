# 校园论坛项目当前状态（CURRENT_STATUS）

> 本文档为项目长期状态记录，每完成一个模块后同步更新。
> 最后更新：2026-08-19
> 当前版本：v0.3.0-dev
> 项目阶段：第三阶段（论坛核心功能）代码开发完成，待数据库迁移和验收

---

## 一、项目概述

校园论坛平台，面向在校大学生，提供交流、分享和学习的社区功能。

技术栈：HTML5 + CSS3 + JavaScript (ES6+) + Supabase (PostgreSQL + Auth + Storage)

架构：Pages → Components → Services → Utils → Config（分层架构，Service 层封装所有数据库操作）

UI 规范：Google Material Design 3 (Material You)，移动端优先，响应式布局，支持深色模式

部署：GitHub Pages（gh-pages 分支）+ 独立服务器（proxy-server.py）

---

## 二、开发阶段总览

| 阶段 | 状态 | 版本 | 完成日期 |
|------|------|------|----------|
| 第一阶段：项目基础架构 | 已完成 | v0.1.0 | 2026-07-05 |
| 第二阶段：用户系统 | 已完成 | v0.1.4 | 2026-07-08 |
| 第三阶段：论坛核心功能 | 代码完成，待DB迁移验收 | v0.3.0-dev | - |
| 第四阶段：高级功能开发 | 未开始 | - | - |
| 第五阶段：优化与部署 | 未开始 | - | - |

---

## 三、第三阶段模块详细状态

### 3.1 代码已完成模块（等待数据库迁移后验收）

首页模块（home）
- pages/home.html - 完成
- js/home.js - 完成（模块化组装入口）
- components/header.js - 完成（导航栏、搜索、用户菜单）
- components/feed.js - 完成（帖子列表渲染、分页、空状态、XSS防护）
- components/sidebar.js - 完成（侧边栏导航、退出登录）
- components/right-sidebar.js - 完成（热门帖子、统计信息）

发帖模块（post）
- pages/post.html - 完成（含独立标题输入框）
- js/post.js - 完成（标题+内容+图片上传+标签、XSS防护、统一5MB限制）
- services/post.js createPost/savePostImages - 完成
- services/storage.js uploadPostImages - 完成（统一5MB限制）

帖子详情模块（post-detail）
- pages/post-detail.html - 完成（页面结构、Bottom Sheet 评论）
- js/post-detail.js - 完成
  - 帖子内容展示、浏览量统计、标签展示、置顶/热门标记
  - 图片展示（getPostImages 已集成）
  - 评论列表、发表评论、回复评论（Bottom Sheet 交互）
  - 点赞按钮交互
  - 收藏按钮交互
  - 举报弹窗
  - 删除帖子（软删除）
  - 编辑跳转
  - XSS防护

评论模块（comment）
- services/comment.js - 完成（createComment、getComments、deleteComment、getCommentCount）
- 支持评论回复（parent_comment_id）
- 批量用户信息查询（已优化N+1）

点赞模块（like）
- services/like.js - 完成（toggleLike、getLikeCount、isLiked）

收藏模块（favorite）
- services/favorite.js - 完成（toggleFavorite、getFavoriteCount、isSaved、getUserFavorites）
- js/favorites.js - 完成（真实数据读取、分页、XSS防护）

举报模块（report）
- services/report.js - 完成（createReport、getUserReports、getReportStatus）
- 举报弹窗已集成到帖子详情页

我的帖子模块（my-posts）
- pages/my-posts.html - 完成
- js/my-posts.js - 完成（用户帖子列表、分页、真实数据读取、XSS防护）
- services/post.js getUserPosts - 完成

图片上传模块
- services/storage.js - 完成（头像上传、帖子图片批量上传）
- 格式校验（jpg/jpeg/png/webp）
- 数量限制（最多9张）
- 大小限制（统一5MB，前后端一致）

分页
- 传统分页（非无限滚动），已在首页、我的帖子、收藏页实现

用户系统（第二阶段已完成）
- pages/login.html + js/login.js - 完成
- pages/register.html + js/register.js - 完成
- pages/profile.html + js/profile.js - 完成

### 3.2 已知限制

搜索模块（search）
- pages/search.html - 完成（页面结构）
- js/search.js - 占位（基础框架，未接入真实搜索）
- 全文搜索功能属于第四阶段范围

编辑帖子模块
- services/post.js updatePost - 已实现（Service 层就绪）
- 前端编辑页面 - 未实现（post.html 需支持编辑模式）

通知系统 - 未开始（第四阶段）
私信系统 - 未开始（第四阶段）
用户关注 - 未开始（第四阶段）
管理员后台 - 未开始（第四阶段）

---

## 四、Service 层状态

| 服务文件 | 状态 | 说明 |
|----------|------|------|
| services/api.js | 完成 | 通用 API 封装（CRUD、分页、查询、RPC） |
| services/auth.js | 完成 | 登录/注册/登出/权限判断/会话管理/getUserInfo/getUsersInfo（批量） |
| services/post.js | 完成 | 帖子 CRUD + 图片关联 + 批量用户信息 + 批量图片查询 |
| services/comment.js | 完成 | 评论 CRUD + 回复 + 批量用户信息 |
| services/like.js | 完成 | 点赞 toggle + 计数 + 状态查询 |
| services/favorite.js | 完成 | 收藏 toggle + 计数 + 状态查询 + 用户收藏列表 |
| services/report.js | 完成 | 举报创建 + 查询 + 状态 |
| services/storage.js | 完成 | 头像/帖子图片上传（统一5MB限制） |
| services/logger.js | 完成 | 日志记录 |
| services/permission.js | 完成 | 权限服务 |

---

## 五、数据库状态

### 5.1 数据库表现状

| 表名 | 迁移文件 | 执行状态 | 说明 |
|------|----------|----------|------|
| posts | 20260711000000/05 | 已执行 | id 为 VARCHAR 类型（非UUID） |
| post_images | 20260707000000 | 已执行 | post_id 为 VARCHAR（已修正匹配 posts.id） |
| profiles | 20260819000000 | 待执行 | id 为 UUID（引用 auth.users.id） |
| comments | 20260819000000 | 待执行 | post_id 为 VARCHAR（匹配 posts.id），user_id 为 UUID |
| post_likes | 20260819000000 | 待执行 | post_id 为 VARCHAR（匹配 posts.id），user_id 为 UUID |
| post_saves | 20260819000000 | 待执行 | post_id 为 VARCHAR（匹配 posts.id），user_id 为 UUID |
| reports | 20260819000000 | 待执行 | target_id 为 VARCHAR（兼容 posts.id） |

### 5.2 SQL 迁移文件说明

**最终执行文件（唯一需要执行的文件）：**
```
docs/sql/20260819000000_phase3_final_migration.sql
```

此文件整合了第三阶段所有数据库结构，包括：
- profiles 表（含 bio/signature 列 + 触发器自动创建 + 回填现有用户）
- comments 表（含 parent_comment_id，UUID 类型，RLS）
- post_likes 表（UNIQUE 约束，RLS）
- post_saves 表（UNIQUE 约束，RLS）
- reports 表（CHECK 约束，RLS）
- 4个 RPC 函数（increment_post_views、update_post_likes_count、update_post_comments_count、update_post_favorites_count）
- updated_at 自动更新触发器
- Storage 存储桶和策略（avatars + post-images）

**历史迁移文件（不再需要执行）：**
```
20260707000000_add_post_images_table.sql          - 已被早期阶段执行
20260707000001_create_categories_table.sql        - 分类已移除，不需要
20260707000002_create_admin_user.sql              - 使用 auth.admin API，不兼容
20260711000000_create_posts_table.sql             - 已执行，含 OWNER TO supabase_admin
20260711000004_migrate_posts_table.sql            - 与 0000 重复
20260711000005_rebuild_posts_tables.sql           - 破坏性重建，已执行
20260711000006_create_interaction_tables.sql     - 被 20260819000000 取代
20260711000007_create_profiles_table.sql         - 被 20260819000000 取代
20260711000008_create_post_images_storage_policy.sql - 被 20260819000000 取代
20260711000009_create_comments_table.sql         - 类型冲突（VARCHAR），被取代
20260731000001_add_comment_replies_*.sql          - 被 20260819000000 取代
20260731000002_fix_phase3_database.sql            - 被 20260819000000 取代
```

### 5.3 数据库函数

| 函数名 | 参数 | 用途 | 执行状态 |
|--------|------|------|----------|
| increment_post_views | p_post_id UUID | 浏览量递增 | 待执行 |
| update_post_likes_count | p_post_id UUID | 更新点赞数 | 待执行 |
| update_post_comments_count | p_post_id UUID | 更新评论数 | 待执行 |
| update_post_favorites_count | p_post_id UUID | 更新收藏数 | 待执行 |
| handle_new_user | - | 新用户注册时自动创建 profile | 待执行 |
| update_updated_at_column | - | 自动更新 updated_at | 待执行 |

### 5.4 数据存储说明

用户资料双重存储：
- Supabase Auth user_metadata：昵称、头像、bio、signature（profile.js 直接更新）
- profiles 表：通过触发器从 auth.users 自动同步
- getUserInfo/getUsersInfo 从 profiles 表读取

---

## 六、已知问题与风险

### 6.1 已修复的问题

1. ~~XSS 漏洞~~ - 已修复
   - 所有 innerHTML 拼接用户数据的位置已使用 escapeHtml 转义
   - 涉及文件：feed.js、post-detail.js、my-posts.js、favorites.js、post.js

2. ~~图片大小限制不一致~~ - 已修复
   - 前端 10MB 与配置 5MB 不一致 → 统一为 config.maxPostImageSize (5MB)
   - 前端校验和 Service 层校验一致

3. ~~发帖缺少独立标题输入~~ - 已修复
   - post.html 新增标题输入框（2-200字）
   - post.js 使用用户输入的标题，不再从正文截取

4. ~~N+1 查询问题~~ - 已修复
- auth.js 新增 getUsersInfo(userIds) 批量查询方法
- post.js _attachUserInfo 改为批量查询用户信息和帖子图片
- comment.js _attachUserInfo 改为批量查询用户信息

5. ~~post_id 类型不一致~~ - 已修复
- 统一迁移文件中 comments.post_id 使用 UUID 类型
- 兼容已存在的 VARCHAR 类型（自动迁移）

6. ~~comments 表重复定义~~ - 已修复
- 统一迁移文件取代所有历史 comments 表定义

7. ~~_attachUserInfo 权限问题~~ - 已修复
- 改用 profiles 表通过 apiService 查询，不使用 admin API

8. ~~post-detail.js 未调用 getPostImages~~ - 已修复
- 帖子详情页已集成图片展示

### 6.2 当前待处理事项

1. 数据库迁移未执行
   - profiles、comments、post_likes、post_saves、reports 表未创建
   - 所有 RPC 函数未创建
   - Storage 存储桶和策略未创建
   - 解决方案：执行 20260819000000_phase3_final_migration.sql

2. 搜索功能为占位实现
   - 属于第四阶段范围，第三阶段不要求

3. 编辑帖子功能前端未实现
   - Service 层已就绪，前端 post.html 需支持编辑模式

### 6.3 非阻塞性问题

4. 用户资料双重存储
   - auth.users.user_metadata 和 profiles 表同时存储用户资料
   - 当前通过触发器保持同步，长期应考虑统一为单一数据源

---

## 七、文件清单

### 7.1 核心源码文件

配置层（config/）
- config/supabase.js - Supabase 客户端初始化 + 统一配置

服务层（services/）
- services/api.js - 通用 API 服务
- services/auth.js - 认证服务（含批量用户查询 getUsersInfo）
- services/post.js - 帖子服务（批量用户信息 + 批量图片查询）
- services/comment.js - 评论服务（含回复）
- services/like.js - 点赞服务
- services/favorite.js - 收藏服务
- services/report.js - 举报服务
- services/storage.js - 存储服务（统一5MB限制）
- services/logger.js - 日志服务
- services/permission.js - 权限服务

组件层（components/）
- components/header.js - 顶部导航
- components/feed.js - 帖子流（XSS防护）
- components/sidebar.js - 侧边栏
- components/right-sidebar.js - 右侧边栏

页面层（pages/）
- pages/login.html
- pages/register.html
- pages/profile.html
- pages/home.html
- pages/post.html（含独立标题输入框）
- pages/post-detail.html
- pages/my-posts.html
- pages/favorites.html
- pages/search.html

脚本层（js/）
- js/login.js
- js/register.js
- js/profile.js
- js/home.js
- js/post.js（含标题输入、XSS防护、统一5MB限制）
- js/post-detail.js（完整评论/点赞/收藏/举报交互、XSS防护）
- js/my-posts.js（XSS防护）
- js/favorites.js（真实数据、XSS防护）
- js/search.js（占位）
- js/agreement-data.js

工具层（utils/）
- utils/helpers.js（含 escapeHtml XSS防护函数）
- utils/storage.js

资源层（assets/）
- assets/js/supabase.js - Supabase SDK 本地化
- assets/js/supabase.min.js

样式层（css/）
- css/styles.css - 全局样式（Material Design 3）

### 7.2 文档文件

- docs/architecture.md - 架构文档
- docs/database-design.md - 数据库设计
- docs/api-docs.md - API 文档
- docs/migration.md - 迁移文档
- docs/changelog.md - 更新日志
- docs/roadmap.md - 开发路线图
- docs/coding-standard.md - 编码规范
- docs/folder-structure.md - 目录结构
- docs/deployment.md - 部署文档
- docs/security.md - 安全文档
- docs/CURRENT_STATUS.md - 本文档

---

## 八、版本历史

| 版本 | 日期 | 内容 |
|------|------|------|
| v0.1.0 | 2026-07-05 | 项目基础架构完成 |
| v0.1.1 | 2026-07-07 | 用户登录模块完成 |
| v0.1.2 | 2026-07-07 | 用户注册模块完成 |
| v0.1.3 | 2026-07-07 | 用户资料基础模块完成 |
| v0.1.4 | 2026-07-08 | 第二阶段整改完成 |
| v0.2.0 | 2026-07-08 | 首页模块完成 |
| v0.2.1 | 2026-07-07 | 发帖功能完成 |
| Preview 2.0 | 2026-07-28 | GitHub Pages 部署上线 |
| Preview 2.1 | 2026-07-28 | 移动端 Bug 修复（图片响应式、注册按钮） |
| v0.3.0-dev | 2026-08-19 | 第三阶段代码收尾完成（XSS修复、图片限制统一、标题输入、N+1优化、SQL迁移整理），待数据库迁移验收 |

---

## 九、下一阶段优先事项

1. 执行数据库迁移
   - 在 Supabase SQL Editor 中执行 20260819000000_phase3_final_migration.sql
   - 验证所有表、函数、触发器、RLS策略创建成功

2. 功能验收测试
   - 首页真实数据加载（依赖 profiles 表）
   - 发帖（含标题+正文+图片）
   - 帖子详情（含图片展示）
   - 评论+回复
   - 点赞
   - 收藏
   - 举报
   - 分页
   - 我的帖子
   - 我的收藏

3. 进入第四阶段开发
   - 搜索功能
   - 通知系统
   - 编辑帖子前端
   - 管理员后台

---

## 十、开发约束备忘

- 不改变项目架构，不重构，不引入新框架
- 保持 Service 层设计，页面不直接调用 Supabase
- 局部修改，不因一个 Bug 重写整个模块
- 修改前先分析影响范围，经确认后再修改
- 数据库变更同步更新 migration.md 和 database-design.md
- 新增 API 同步更新 docs/api-docs.md
- 每个模块完成后暂停，等待验收
- 验收通过后才能进入下一模块
- 所有修改遵循 Material Design 3 规范
- 错误提示使用 Snackbar 通知
- 按钮需提供视觉反馈（loading 状态）
- 响应式布局优先，移动端适配
- Supabase 密钥：客户端只用 anon 公钥，service_role 仅服务端使用
