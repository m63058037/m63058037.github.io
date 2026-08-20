# 数据库结构确认报告

## 一、AI回复规范声明

我已重新阅读《开发需求.txt》《UI设计规范.txt》《项目开发总规则.md》，本次开发严格遵循三份文档。

---

## 二、问题背景

### 2.1 原方案问题

**错误**: `ERROR: 42P01: relation "profiles" does not exist`

**原因**: Supabase 数据库中不存在 `profiles` 表，导致 UID 登录方案失败。

### 2.2 用户需求

- ✅ 完全删除邮箱，只使用 UID 登录和注册
- ✅ UID 为8位数字
- ✅ 不需要 profiles 表
- ✅ 保持分层架构：页面 → Service → Supabase

---

## 三、解决方案

### 3.1 虚拟邮箱方案

由于 Supabase Auth 必须有邮箱才能创建用户，我们使用 **UID 生成虚拟邮箱**：

```
UID: 12345678 → 虚拟邮箱: 12345678@campus-forum.local
```

**优点**:
- 用户只看到 UID，完全看不到邮箱
- 不需要额外的数据表
- UID 唯一性由虚拟邮箱唯一性保证
- 与 Supabase Auth 原生兼容

### 3.2 用户数据存储

用户信息存储在 Supabase Auth 的 `user_metadata` 中：

| 字段 | 来源 | 说明 |
|------|------|------|
| uid | 用户输入 | 8位数字UID |
| nickname | 用户输入 | 用户昵称 |
| avatar | 自动生成 | 默认头像URL |
| role | 系统设置 | 用户角色 |
| is_admin | 系统设置 | 是否管理员 |

---

## 四、修改文件

### 4.1 Service 层

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `开发文件夹/services/auth.js` | 修改 | 使用虚拟邮箱，删除 profiles 表依赖 |
| `开发文件夹/services/post.js` | 修改 | 使用 Auth API 获取用户信息，删除 profiles 表依赖 |

### 4.2 页面层

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `开发文件夹/pages/login.html` | 修改 | 删除邮箱输入框，只保留 UID 和密码 |
| `开发文件夹/js/login.js` | 修改 | 删除邮箱验证，使用 UID 登录 |
| `开发文件夹/pages/register.html` | 修改 | 删除邮箱输入框，只保留 UID、昵称、密码 |
| `开发文件夹/js/register.js` | 修改 | 删除邮箱验证，使用 UID 注册 |

---

## 五、数据库结构

### 5.1 当前使用的数据表

根据代码分析，当前项目使用以下数据表：

| 表名 | 用途 | 说明 |
|------|------|------|
| `auth.users` | 用户认证 | Supabase Auth 内置表 |
| `posts` | 帖子存储 | 用户帖子数据 |
| `post_images` | 帖子图片 | 帖子图片关联 |

### 5.2 auth.users 表结构（Supabase 内置）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 用户唯一ID |
| email | text | 用户邮箱（虚拟邮箱） |
| encrypted_password | text | 加密密码 |
| user_metadata | jsonb | 用户元数据（uid、nickname、avatar等） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### 5.3 posts 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar/uuid | 帖子ID |
| user_id | varchar/uuid | 作者ID（关联 auth.users.id） |
| title | text | 帖子标题 |
| content | text | 帖子内容 |
| category_id | varchar | 分类ID |
| tags | text[] | 标签数组 |
| excerpt | text | 摘要 |
| is_pinned | boolean | 是否置顶 |
| is_hot | boolean | 是否热门 |
| is_locked | boolean | 是否锁定 |
| is_deleted | boolean | 是否删除 |
| views_count | integer | 浏览数 |
| likes_count | integer | 点赞数 |
| comments_count | integer | 评论数 |
| favorites_count | integer | 收藏数 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### 5.4 post_images 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar/uuid | 图片ID |
| post_id | varchar | 帖子ID（关联 posts.id） |
| url | text | 图片URL |
| path | text | 存储路径 |
| file_name | text | 文件名 |
| sort_order | integer | 排序顺序 |
| created_at | timestamp | 创建时间 |

### 5.5 不需要的数据表

| 表名 | 原因 |
|------|------|
| profiles | 用户信息已存储在 auth.users.user_metadata 中 |

---

## 六、登录流程

### 6.1 UID 登录流程

```
用户输入 UID + 密码
    ↓
Page (login.js)
    ↓
authService.login(uid, password)
    ↓
生成虚拟邮箱: uid@campus-forum.local
    ↓
supabase.auth.signInWithPassword({ email, password })
    ↓
Supabase Auth 验证
    ↓
登录成功，保存 Session
    ↓
返回用户信息（包含 uid、nickname、avatar）
```

### 6.2 UID 注册流程

```
用户输入 UID + 密码 + 昵称
    ↓
Page (register.js)
    ↓
authService.register(uid, password, nickname)
    ↓
生成虚拟邮箱: uid@campus-forum.local
    ↓
supabase.auth.signUp({ email, password, options: { data: { uid, nickname, avatar } } })
    ↓
Supabase Auth 创建用户
    ↓
注册成功
```

---

## 七、架构保持

### 7.1 分层架构

```
页面（Page）
    ↓
Service（authService、postService）
    ↓
Supabase Client（config/supabase.js）
    ↓
Supabase SDK（本地）
```

### 7.2 禁止越层访问

- ✅ 页面不直接调用 Supabase
- ✅ 所有数据库操作通过 Service 层
- ✅ 用户信息通过 Auth Service 获取
- ✅ 帖子信息通过 Post Service 获取

### 7.3 安全考虑

- ✅ UID 验证：只接受8位数字格式
- ✅ 密码验证：保持原有密码强度要求
- ✅ 错误提示：隐藏具体错误原因
- ✅ 日志记录：记录登录尝试（成功/失败）

---

## 八、测试结果

### 8.1 静态验证测试

| 测试项 | 测试内容 | 结果 |
|--------|----------|------|
| 登录页面 UID 输入框 | 检查是否只存在 UID 和密码 | ✅ 通过 |
| 注册页面 UID 输入框 | 检查是否只存在 UID、密码、昵称 | ✅ 通过 |
| 虚拟邮箱生成 | 检查 auth.js 中虚拟邮箱生成逻辑 | ✅ 通过 |
| 删除 profiles 依赖 | 检查 auth.js 是否删除 profiles 查询 | ✅ 通过 |
| 删除 profiles 依赖 | 检查 post.js 是否删除 profiles 查询 | ✅ 通过 |
| 分层架构 | 检查是否符合页面→Service→Supabase | ✅ 通过 |

### 8.2 动态功能测试

| 测试项 | 测试内容 | 预期结果 | 实际结果 |
|--------|----------|----------|----------|
| UID 注册 | 使用8位UID+密码+昵称注册 | 注册成功 | ⏳ 待测试 |
| UID 登录 | 使用8位UID+密码登录 | 登录成功 | ⏳ 待测试 |
| Session 保存 | 登录后检查 Session | Session 正常保存 | ⏳ 待测试 |
| 首页访问 | 登录后访问首页 | 正常进入首页 | ⏳ 待测试 |
| 发帖功能 | 登录后发帖 | 正常发帖 | ⏳ 待测试 |
| UID 格式验证 | 输入非8位数字 | 显示错误提示 | ⏳ 待测试 |
| 重复 UID 注册 | 使用已注册的UID注册 | 提示"该UID已被注册" | ⏳ 待测试 |

---

## 九、是否符合三份开发文档要求

### 9.1 《开发需求.txt》

| 需求 | 状态 | 说明 |
|------|------|------|
| UID 登录 | ✅ 符合 | 登录页面只使用 UID |
| UID 注册 | ✅ 符合 | 注册页面只使用 UID |
| 8位数字 UID | ✅ 符合 | 验证规则限制为8位数字 |
| 删除邮箱 | ✅ 符合 | 登录和注册页面都没有邮箱输入 |
| 分层架构 | ✅ 符合 | 页面→Service→Supabase |

### 9.2 《UI设计规范.txt》

| 规范 | 状态 | 说明 |
|------|------|------|
| Material Design 3 | ✅ 符合 | 保持卡片圆角、阴影、颜色 |
| 响应式设计 | ✅ 符合 | 已修复响应式布局问题 |
| 组件化开发 | ✅ 符合 | Service 层已模块化 |

### 9.3 《项目开发总规则.md》

| 规则 | 状态 | 说明 |
|------|------|------|
| 分层架构 | ✅ 符合 | 严格遵循页面→Service→数据层 |
| Service 层封装 | ✅ 符合 | 所有数据库操作通过 Service |
| 禁止直接调用 Supabase | ✅ 符合 | 页面不直接调用 Supabase |
| 统一错误处理 | ✅ 符合 | 所有 Service 使用统一响应格式 |
| 不假设 profiles 表 | ✅ 符合 | 已完全删除 profiles 表依赖 |

---

## 十、验收结论

### 10.1 当前状态

| 项目 | 状态 |
|------|------|
| 登录页面删除邮箱 | ✅ 完成 |
| 登录逻辑修改 | ✅ 完成 |
| 注册页面删除邮箱 | ✅ 完成 |
| 注册逻辑修改 | ✅ 完成 |
| Auth Service 修改 | ✅ 完成 |
| Post Service 修改 | ✅ 完成 |
| 虚拟邮箱方案 | ✅ 完成 |
| 删除 profiles 依赖 | ✅ 完成 |
| 架构合规性 | ✅ 符合 |

### 10.2 待测试项

1. 使用8位UID注册新用户
2. 使用UID登录
3. 验证登录后可以访问首页
4. 验证登录后可以发帖
5. 测试UID格式验证
6. 测试重复UID注册

### 10.3 建议

建议项目负责人：
1. 在浏览器中打开 [http://localhost:3000/pages/register.html](http://localhost:3000/pages/register.html) 测试注册功能
2. 在浏览器中打开 [http://localhost:3000/pages/login.html](http://localhost:3000/pages/login.html) 测试登录功能
3. 验证登录后可以正常访问首页和发帖
4. 确认测试结果后下达下一步开发指令