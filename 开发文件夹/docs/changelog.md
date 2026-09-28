# 校园论坛项目更新日志

## v0.3.0-dev (2026-08-19)

### 第三阶段：论坛核心功能 - 最终收尾

#### Migration 修正（基于实际数据库类型）
- 确认 posts.id 实际类型为 VARCHAR（非 UUID）
- 所有 post_id 字段从 UUID 修正为 VARCHAR（comments/post_likes/post_saves）
- reports.target_id 从 UUID 修正为 VARCHAR（兼容 posts.id）
- 所有 RPC 函数参数从 UUID 修正为 VARCHAR（4个函数）
- 移除不兼容的 ALTER TABLE ADD CONSTRAINT IF NOT EXISTS
- 移除错误的 VARCHAR→UUID 类型转换逻辑
- Storage 策略修正为最小权限：头像按用户ID验证路径，帖子图片按帖子归属验证
- 所有 SECURITY DEFINER 函数添加 SET search_path = public 防止搜索路径操纵
- 所有 RPC 函数添加 REVOKE FROM PUBLIC / GRANT TO authenticated 权限控制
- 修正 post.js 中 RPC 参数名 post_id → p_post_id（与其他 Service 一致）

#### 安全修复
- 新增 `escapeHtml` XSS 防护函数 (`utils/helpers.js`)
- 修复 `components/feed.js` 中 innerHTML 拼接用户数据的 XSS 漏洞
- 修复 `js/post-detail.js` 中评论渲染的 XSS 漏洞
- 修复 `js/my-posts.js` 中帖子卡片的 XSS 漏洞
- 修复 `js/favorites.js` 中帖子卡片的 XSS 漏洞
- 修复 `js/post.js` 中图片预览的 XSS 漏洞

#### 一致性修复
- 统一图片大小限制为 5MB（`config.maxPostImageSize`）
  - `js/post.js` 从 10MB 改为使用 config 值
  - `services/storage.js` 从 10MB 改为使用 config 值
  - 前端校验与 Service 层校验一致

#### 功能完善
- 发帖页面新增独立标题输入框 (`pages/post.html`)
  - 标题 2-200 字符，带字符计数和校验
  - `js/post.js` 使用用户输入的标题，不再从正文截取

#### 性能优化
- N+1 查询问题修复
  - `services/auth.js` 新增 `getUsersInfo(userIds)` 批量查询方法
  - `services/post.js` `_attachUserInfo` 改为批量查询用户信息和帖子图片
  - `services/comment.js` `_attachUserInfo` 改为批量查询用户信息

#### 数据库迁移整理
- 创建统一迁移文件 `20260819000000_phase3_final_migration.sql`
  - 整合 profiles、comments、post_likes、post_saves、reports 表
  - 统一 UUID 类型（修复 VARCHAR 冲突）
  - 包含所有 RPC 函数（4个计数/浏览量函数）
  - 包含触发器（新用户自动创建 profile、updated_at 自动更新）
  - 包含 Storage 存储桶和策略
  - 幂等设计（IF NOT EXISTS / DO $$ / CREATE OR REPLACE）
  - 无 `OWNER TO supabase_admin` 不兼容语句
  - 无 `auth.admin.create_user` 不兼容调用

#### 文档更新
- 更新 `CURRENT_STATUS.md` 反映第三阶段真实状态
- 更新 `changelog.md` 添加收尾记录

#### 状态
- 代码开发完成，待数据库迁移和用户验收
- 未执行 Git commit / push
- 未执行数据库迁移

## v0.2.1 (2026-07-07)

### 第三阶段：论坛核心功能 - 发帖功能

#### 数据库
- 创建 post_images 表迁移 (`docs/sql/20260707000000_add_post_images_table.sql`)
  - 字段：id, post_id, url, path, file_name, sort_order, created_at
  - 创建索引 idx_post_images_post_id
  - 创建索引 idx_post_images_sort_order
  - 创建 RLS 策略（SELECT/INSERT/UPDATE/DELETE）

#### 服务层
- 更新帖子服务 (`services/post.js`)
  - 新增 savePostImages(postId, images) 方法
  - 新增 getPostImages(postId) 方法

- 更新存储服务 (`services/storage.js`)
  - uploadPostImages 方法已就绪，支持批量上传
  - 文件路径格式：{postId}/{uniqueFileName}

#### 页面
- 更新发帖页面逻辑 (`js/post.js`)
  - 实现完整发帖流程：createPost → uploadPostImages → savePostImages
  - 图片预览（FileReader 客户端预览）
  - 图片删除（预览阶段）
  - 格式校验（jpg/jpeg/png/webp）
  - 数量限制（最多9张）
  - 严格遵循 页面→Service→Supabase 架构

#### 文档
- 更新数据库迁移文档 (`docs/migration.md`)
- 更新更新日志 (`docs/changelog.md`)
- 更新开发路线图 (`docs/roadmap.md`)

## v0.2.0 (2026-07-08)

### 第三阶段：论坛核心功能 - 首页模块

#### 服务层
- 创建帖子服务 (`services/post.js`)
  - 实现帖子列表查询（支持分页、分类筛选）
  - 实现帖子详情查询
  - 实现帖子创建、更新、删除
  - 实现浏览量递增
  - 实现用户帖子查询
  - 自动关联用户信息

- 创建分类服务 (`services/category.js`)
  - 实现分类列表查询
  - 实现分类单条查询（按ID、按别名）

#### 页面
- 创建首页页面 (`pages/home.html`)
  - 顶部导航栏（Logo、搜索框、发帖按钮、用户菜单）
  - 分类导航栏（横向滚动）
  - 帖子列表（卡片式布局）
  - 分页组件
  - 侧边栏菜单（响应式）
  - 右侧边栏（热门帖子、最新回复、统计信息）

#### JavaScript
- 创建首页逻辑 (`js/home.js`)
  - 模块化组装入口，统一页面初始化流程
  - 协调各组件间通信（分类切换、搜索）
  - 移除假数据，使用真实数据库数据

#### 组件层
- 创建顶部导航组件 (`components/header.js`)
  - Logo展示、搜索框、用户菜单
  - 分类导航栏、发帖按钮
  - 用户信息展示（头像、昵称）

- 创建帖子流组件 (`components/feed.js`)
  - 帖子列表渲染、分页功能
  - Loading状态、空状态展示
  - 帖子卡片、图片预览

- 创建侧边栏组件 (`components/sidebar.js`)
  - 导航菜单、分类列表
  - 退出登录功能
  - 响应式侧边栏控制

- 创建右侧边栏组件 (`components/right-sidebar.js`)
  - 热门帖子列表
  - 统计信息（总帖子、总评论、总用户）
  - 从Service层读取真实数据

#### CSS
- 更新全局样式 (`css/styles.css`)
  - 添加首页布局样式
  - 添加响应式断点（桌面、平板、移动端）
  - 支持深色模式
  - Material Design 3 风格

#### 文档
- 更新开发路线图 (`roadmap.md`)
- 更新更新日志 (`changelog.md`)

## v0.1.4 (2026-07-08)

### 第二阶段整改

#### JavaScript
- 更新用户资料页面逻辑 (`js/profile.js`)
  - 使用 storageService 替代直接调用 supabase.storage
  - 统一页面初始化流程（检查Session→获取用户→读取数据→渲染→绑定事件）
  - 优化资料保存逻辑，无修改时提示"没有需要保存的修改"
- 更新登录页面逻辑 (`js/login.js`)
  - 统一页面初始化流程（检查Session→获取用户→读取数据→渲染→绑定事件）
- 更新注册页面逻辑 (`js/register.js`)
  - 统一页面初始化流程（检查Session→获取用户→读取数据→渲染→绑定事件）

#### 服务层
- 完善 Storage 服务 (`services/storage.js`)
  - 统一图片上传规范（仅支持 jpg/jpeg/png/webp）
  - 统一 Storage 目录结构（avatars/user-id/、posts/post-id/）
  - 生成唯一文件名，禁止使用用户原始文件名

#### 文档
- 更新数据库设计文档 (`database-design.md`)
  - 添加 profiles 数据表迁移规划说明
- 更新数据库迁移文档 (`migration.md`)
  - 添加 profiles 表数据迁移计划（v0.1.4）
- 更新开发路线图 (`roadmap.md`)
  - 调整阶段划分（第一阶段、第二阶段已完成，第三阶段论坛核心功能）
- 更新更新日志 (`changelog.md`)

## v0.1.3 (2026-07-07)

### 阶段2-3：用户资料基础模块（Profile）

#### 页面
- 创建用户资料页面 (`pages/profile.html`)

#### CSS
- 更新全局样式文件 (`css/styles.css`)
- 添加用户资料页面样式
- 添加头像上传组件样式
- 添加表单文本域样式
- 添加表单按钮组样式

#### JavaScript
- 创建用户资料页面逻辑 (`js/profile.js`)
- 实现个人资料查看
- 实现昵称修改
- 实现头像上传（Supabase Storage）
- 实现个人简介修改
- 实现个性签名修改
- 实现资料保存
- 实现退出登录

#### 文档
- 更新数据库迁移文档 (`migration.md`)
- 更新开发路线图 (`roadmap.md`)
- 更新更新日志 (`changelog.md`)

## v0.1.2 (2026-07-07)

### 阶段2-2：用户注册模块

#### 页面
- 创建注册页面 (`pages/register.html`)

#### CSS
- 更新全局样式文件 (`css/styles.css`)
- 添加注册页面样式
- 添加密码强度指示器样式

#### JavaScript
- 创建注册页面逻辑 (`js/register.js`)
- 实现邮箱验证
- 实现密码强度校验
- 实现二次输入密码校验
- 实现昵称验证
- 实现用户协议确认
- 实现注册成功提示
- 实现注册失败提示（Material Design 3 Snackbar）

#### 文档
- 更新开发需求文档 (`开发需求.txt`)
- 更新数据库设计文档 (`database-design.md`)
- 更新开发路线图 (`roadmap.md`)
- 更新更新日志 (`changelog.md`)

## v0.1.1 (2026-07-07)

### 阶段2-1：用户登录模块

#### 页面
- 创建登录页面 (`pages/login.html`)

#### CSS
- 创建全局样式文件 (`css/styles.css`)
- 实现 Material Design 3 / Material You 风格
- 支持深色模式适配
- 响应式布局

#### JavaScript
- 创建登录页面逻辑 (`js/login.js`)
- 实现表单验证
- 实现密码可见性切换
- 实现登录状态管理（使用 Supabase Auth 官方 Session 管理）
- 实现登录失败提示（Material Design 3 Snackbar）
- 实现登录成功跳转

#### 文档
- 更新 API 文档 (`api-docs.md`)

## v0.1.0 (2026-07-05)

### 项目基础架构

#### 文档
- 创建项目架构文档 (`architecture.md`)
- 创建数据库设计文档 (`database-design.md`)
- 创建 API 接口文档 (`api-docs.md`)
- 创建目录结构文档 (`folder-structure.md`)
- 创建编码规范文档 (`coding-standard.md`)
- 创建更新日志 (`changelog.md`)
- 创建开发路线图 (`roadmap.md`)
- 创建部署文档 (`deployment.md`)
- 创建数据库迁移文档 (`migration.md`)
- 创建安全文档 (`security.md`)

#### 配置
- 创建 Supabase 配置文件 (`config/supabase.js`)

#### 服务层
- 创建通用 API 服务 (`services/api.js`)
- 创建认证服务 (`services/auth.js`)

#### 工具层
- 创建通用工具函数 (`utils/helpers.js`)
- 创建存储工具函数 (`utils/storage.js`)

#### 目录结构
- 创建完整的项目目录结构
- 创建空目录的 `.gitkeep` 文件