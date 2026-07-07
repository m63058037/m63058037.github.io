# 第三阶段-2 发帖功能开发报告

## 一、概述

本阶段完成了发帖功能的核心开发，实现了纯文字帖子和图文帖子的发布能力，严格遵循页面→Service→Supabase 的分层架构。

## 二、完成内容

### 2.1 功能实现

| 功能点 | 状态 | 说明 |
|--------|------|------|
| 纯文字帖子 | ✅ 已完成 | 支持标题、内容、分类、标签 |
| 图文帖子 | ✅ 已完成 | 支持标题、内容、图片、分类、标签 |
| 图片上传限制 | ✅ 已完成 | 单篇帖子最多9张图片 |
| 图片格式校验 | ✅ 已完成 | 仅支持 jpg/jpeg/png/webp |
| 图片大小限制 | ✅ 已完成 | 单张图片最大10MB |
| 图片预览 | ✅ 已完成 | 客户端预览（FileReader） |
| 图片删除（预览） | ✅ 已完成 | 预览阶段可删除单张图片 |
| 图片关系统一管理 | ✅ 已完成 | 使用 post_images 表管理 |

### 2.2 开发流程

```
用户提交表单
    ↓
postService.createPost() → 创建帖子，获取 postId
    ↓
storageService.uploadPostImages() → 上传图片到 Supabase Storage
    ↓
postService.savePostImages() → 将图片元数据写入 post_images 表
    ↓
跳转到帖子详情页
```

## 三、文件变更

### 3.1 新增文件

| 文件路径 | 说明 |
|----------|------|
| `docs/sql/20260707000000_add_post_images_table.sql` | post_images 表迁移文件 |
| `docs/phase-3-2-report.md` | 本开发报告 |

### 3.2 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `开发文件夹/services/post.js` | 新增 savePostImages、getPostImages 方法 |
| `开发文件夹/js/post.js` | 实现完整发帖流程，集成图片上传 |
| `docs/changelog.md` | 添加 v0.2.1 版本记录 |
| `docs/roadmap.md` | 标记发帖模块已完成 |
| `docs/migration.md` | 更新 post_images 迁移状态 |

## 四、数据库变更

### 4.1 新增表：post_images

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键，自动生成 |
| post_id | UUID | 关联帖子 ID，级联删除 |
| url | TEXT | 图片公开访问 URL |
| path | TEXT | Storage 文件路径 |
| file_name | TEXT | 文件名 |
| sort_order | INTEGER | 排序序号 |
| created_at | TIMESTAMP | 创建时间 |

### 4.2 新增索引

- `idx_post_images_post_id` - 按 post_id 查询
- `idx_post_images_sort_order` - 按 post_id + sort_order 查询

### 4.3 RLS 策略

| 策略 | 说明 |
|------|------|
| SELECT | 用户可查看已发布帖子的图片 |
| INSERT | 用户可插入自己帖子的图片关联 |
| UPDATE | 用户可更新自己帖子的图片关联 |
| DELETE | 用户可删除自己帖子的图片关联 |

### 4.4 迁移状态

**当前状态**: Pending（待执行）

**执行步骤**:
1. 登录 Supabase Console
2. 打开 SQL Editor
3. 新建查询
4. 粘贴 `docs/sql/20260707000000_add_post_images_table.sql` 内容
5. 执行查询

⚠️ **注意**: 在执行迁移之前，发帖功能的图片关联存储部分将无法正常工作。

## 五、Service 设计

### 5.1 postService 新增方法

#### savePostImages(postId, images)

- **功能**: 将图片元数据批量写入 post_images 表
- **参数**:
  - `postId`: 帖子 ID
  - `images`: 图片数组，包含 url、path、fileName
- **返回**: 统一响应格式 { success, data, message, statusCode }

#### getPostImages(postId)

- **功能**: 查询帖子关联的图片列表
- **参数**: `postId` - 帖子 ID
- **返回**: 图片列表，按 sort_order 排序

### 5.2 storageService 使用方法

#### uploadPostImages(files, postId)

- **功能**: 将图片文件上传到 Supabase Storage
- **参数**:
  - `files`: File 对象数组
  - `postId`: 帖子 ID（用于生成存储路径）
- **存储路径**: `posts/{postId}/{uniqueFileName}`
- **返回**: 上传结果数组，包含 url、path、fileName

### 5.3 错误处理机制

所有 Service 统一采用：
- try...catch 包裹所有异步操作
- console.error() 输出错误信息
- 返回统一格式：{ success, data, message, statusCode }

## 六、测试结果

### 6.1 静态验证

| 验证项 | 结果 | 说明 |
|--------|------|------|
| 文件结构完整性 | ✅ 通过 | 所有必要文件已创建 |
| 代码语法检查 | ✅ 通过 | JavaScript 代码无语法错误 |
| CSS 样式存在性 | ✅ 通过 | image-preview 相关样式已定义 |
| 页面可访问性 | ✅ 通过 | 发帖页面可正常加载 |
| Service 层接口完整性 | ✅ 通过 | postService、storageService 方法齐全 |

### 6.2 待执行测试（需迁移完成后）

| 测试项 | 状态 |
|--------|------|
| 纯文字帖子发布 | ⏳ 待测试 |
| 图文帖子发布（1张图） | ⏳ 待测试 |
| 图文帖子发布（9张图） | ⏳ 待测试 |
| 图片数量超限（10张） | ⏳ 待测试 |
| 图片格式校验（非图片） | ⏳ 待测试 |
| 表单验证（空标题/内容/分类） | ⏳ 待测试 |
| 图片上传到 Storage | ⏳ 待测试 |
| 图片关联合写入 post_images | ⏳ 待测试 |

### 6.3 测试前提条件

1. 执行 `docs/sql/20260707000000_add_post_images_table.sql` 迁移
2. 确保 Supabase Storage `posts` bucket 存在且配置正确
3. 确保 RLS 策略已正确配置

## 七、是否符合项目规则

| 规则 | 状态 | 说明 |
|------|------|------|
| 页面禁止直接访问 Supabase | ✅ 符合 | 所有操作通过 Service 层 |
| 首页模块化开发 | ✅ 符合 | 发帖页面逻辑清晰，职责单一 |
| 帖子功能采用最终需求 | ✅ 符合 | 仅实现纯文字/图文帖子，无视频/附件 |
| 首页不得使用假数据 | ✅ 符合 | 发帖功能操作真实数据库 |
| 所有数据库操作统一走 Service | ✅ 符合 | postService、storageService 统一封装 |
| 统一错误处理机制 | ✅ 符合 | 所有 Service 使用统一响应格式 |

## 八、后续工作

发帖功能开发完成，下一阶段将进入帖子详情模块开发。