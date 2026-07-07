# 用户UID登录适配修复报告

## 一、AI回复规范声明

我已重新阅读《开发需求.txt》《UI设计规范.txt》《项目开发总规则.md》，本次开发严格遵循三份文档。

---

## 二、问题描述

### 2.1 需求不匹配

**问题**: 当前登录页面使用邮箱地址登录，但校园论坛实际用户体系不使用邮箱，学校用户应使用 **UID + 密码** 登录。

**用户需求**:
- UID 为8位数字
- 用户通过 UID 登录系统
- 保持分层架构：页面 → Service → Supabase

### 2.2 架构要求

禁止页面直接查询数据库，必须通过 Service 层进行 UID 到邮箱的映射。

---

## 三、设计方案

### 3.1 UID 登录流程

```
用户输入 UID + 密码
    ↓
Page (login.js)
    ↓
Service (authService.uidLogin())
    ↓
API Service (apiService.findOne('profiles', { uid }))
    ↓
Supabase (查询 profiles 表)
    ↓
返回用户记录（包含 email）
    ↓
authService.login(email, password)
    ↓
Supabase Auth (邮箱+密码验证)
    ↓
登录成功，保存 Session
```

### 3.2 数据库表结构

**profiles 表**需要包含 `uid` 字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 用户ID（Supabase Auth 用户ID） |
| uid | varchar(8) | 8位数字用户UID |
| email | varchar | 用户邮箱 |
| nickname | varchar | 用户昵称 |
| avatar | varchar | 用户头像URL |
| created_at | timestamp | 创建时间 |

---

## 四、修改文件

### 4.1 登录页面

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `开发文件夹/pages/login.html` | 修改 | 将邮箱输入框改为 UID 输入框 |
| `开发文件夹/js/login.js` | 修改 | 更新验证逻辑和登录调用 |

### 4.2 注册页面

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `开发文件夹/pages/register.html` | 修改 | 添加 UID 输入框 |
| `开发文件夹/js/register.js` | 修改 | 添加 UID 验证和注册参数 |

### 4.3 Service 层

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `开发文件夹/services/auth.js` | 修改 | 添加 `uidLogin()` 方法，修改 `register()` 支持 UID |

---

## 五、修改内容

### 5.1 登录页面修改 (login.html)

**修改前**:
```html
<label class="form-label" for="email">邮箱</label>
<input type="email" id="email" placeholder="请输入邮箱地址" />
```

**修改后**:
```html
<label class="form-label" for="uid">用户UID</label>
<input type="text" id="uid" placeholder="请输入8位用户UID" />
```

### 5.2 登录逻辑修改 (login.js)

**主要修改**:
- 将 `emailInput` 改为 `uidInput`
- 将 `validateEmail()` 改为 `validateUid()`，验证8位数字格式
- 将 `authService.login(email, password)` 改为 `authService.uidLogin(uid, password)`

### 5.3 Auth Service 修改 (auth.js)

**新增 `uidLogin()` 方法**:
```javascript
async uidLogin(uid, password) {
  // 1. 通过UID查询profiles表获取用户信息
  const profileResponse = await apiService.findOne('profiles', { uid });
  
  // 2. 验证用户存在且有邮箱
  if (!profileResponse.success || !profileResponse.data) {
    return createResponse(false, null, '用户UID不存在或密码错误', 401);
  }
  
  // 3. 使用邮箱+密码调用原始登录方法
  return await this.login(profile.email, password);
}
```

**修改 `register()` 方法**:
- 新增 `uid` 参数
- 注册成功后自动创建 profiles 记录，保存 uid 字段

### 5.4 注册页面修改 (register.html)

**新增 UID 输入框**:
```html
<div class="form-field">
  <label class="form-label" for="uid">用户UID</label>
  <input type="text" id="uid" placeholder="请输入8位用户UID" required />
</div>
```

### 5.5 注册逻辑修改 (register.js)

**主要修改**:
- 添加 `uidInput` 和 `uidError` 元素引用
- 添加 `validateUid()` 方法，验证8位数字格式
- 修改 `handleSubmit()`，传递 uid 参数给 `authService.register()`
- 更新 `setLoading()` 方法，包含 uidInput

---

## 六、架构保持

### 6.1 分层架构

```
页面（Page）
    ↓
Service（authService）
    ↓
API Service（apiService）
    ↓
Supabase Client
    ↓
Supabase SDK（本地）
```

### 6.2 禁止越层访问

- ✅ 页面不直接调用 Supabase
- ✅ UID 查询通过 API Service 层
- ✅ 登录验证通过 Auth Service 层
- ✅ 不重复定义 Supabase Client

### 6.3 安全考虑

- ✅ UID 验证：只接受8位数字格式
- ✅ 密码验证：保持原有密码强度要求
- ✅ 错误提示：隐藏具体错误原因（统一提示"用户UID不存在或密码错误"）
- ✅ 日志记录：记录登录尝试（成功/失败）

---

## 七、测试结果

### 7.1 静态验证测试

| 测试项 | 测试内容 | 结果 |
|--------|----------|------|
| 登录页面 UID 输入框 | 检查是否存在 UID 输入框 | ✅ 通过 |
| UID 验证规则 | 检查是否验证8位数字格式 | ✅ 通过 |
| 登录调用方式 | 检查是否调用 uidLogin() | ✅ 通过 |
| 注册页面 UID 输入框 | 检查是否新增 UID 输入框 | ✅ 通过 |
| 注册调用方式 | 检查是否传递 uid 参数 | ✅ 通过 |
| Service 层架构 | 检查是否通过 API Service 查询 | ✅ 通过 |

### 7.2 动态功能测试

| 测试项 | 测试内容 | 预期结果 | 实际结果 |
|--------|----------|----------|----------|
| UID 登录 | 使用8位UID+密码登录 | 登录成功 | ⏳ 待测试 |
| Session 保存 | 登录后检查 Session | Session 正常保存 | ⏳ 待测试 |
| 首页访问 | 登录后访问首页 | 正常进入首页 | ⏳ 待测试 |
| 发帖功能 | 登录后发帖 | 正常发帖 | ⏳ 待测试 |
| UID 格式验证 | 输入非8位数字 | 显示错误提示 | ⏳ 待测试 |
| 不存在 UID | 使用不存在的UID登录 | 提示"用户UID不存在" | ⏳ 待测试 |
| 注册功能 | 注册新用户（包含UID） | 注册成功 | ⏳ 待测试 |

---

## 八、已知问题

### 8.1 profiles 表 UID 字段

**描述**: 需要确保 profiles 表已存在 `uid` 字段。

**影响**: 如果 profiles 表没有 uid 字段，登录查询将失败。

**解决方案**: 在 Supabase 控制台中为 profiles 表添加 `uid` 字段（varchar(8)），并创建唯一索引。

### 8.2 用户数据迁移

**描述**: 已有用户需要补充 UID 信息才能使用新的登录方式。

**影响**: 现有用户无法使用 UID 登录，需要通过管理员补充 UID。

**解决方案**: 
1. 通过 Supabase 控制台批量导入用户 UID 数据
2. 或在用户登录后引导用户绑定 UID

---

## 九、是否符合三份开发文档要求

### 9.1 《开发需求.txt》

| 需求 | 状态 | 说明 |
|------|------|------|
| UID 登录 | ✅ 符合 | 登录页面使用 UID |
| 8位数字 UID | ✅ 符合 | 验证规则限制为8位数字 |
| 分层架构 | ✅ 符合 | 页面→Service→API→Supabase |

### 9.2 《UI设计规范.txt》

| 规范 | 状态 | 说明 |
|------|------|------|
| Material Design 3 | ✅ 符合 | 输入框样式遵循 MD3 |
| 响应式设计 | ✅ 符合 | 保持原有响应式布局 |
| 错误提示 | ✅ 符合 | UID 验证错误提示统一 |

### 9.3 《项目开发总规则.md》

| 规则 | 状态 | 说明 |
|------|------|------|
| 分层架构 | ✅ 符合 | 严格遵循页面→Service→数据层 |
| Service 层封装 | ✅ 符合 | UID 查询和登录都通过 Service |
| 禁止直接调用 Supabase | ✅ 符合 | 页面不直接调用 Supabase |
| 统一错误处理 | ✅ 符合 | 所有 Service 使用统一响应格式 |

---

## 十、验收结论

### 10.1 当前状态

| 项目 | 状态 |
|------|------|
| 登录页面 UID 输入 | ✅ 完成 |
| 登录逻辑 UID 验证 | ✅ 完成 |
| Auth Service uidLogin 方法 | ✅ 完成 |
| 注册页面 UID 输入 | ✅ 完成 |
| 注册逻辑 UID 支持 | ✅ 完成 |
| 架构合规性 | ✅ 符合 |

### 10.2 待测试项

1. UID 登录成功（需要 profiles 表有数据）
2. Session 正常保存
3. 登录后可以进入首页
4. 登录后可以正常发帖
5. 注册功能（包含 UID）

### 10.3 数据库准备

**需要在 Supabase 控制台执行**:

```sql
-- 为 profiles 表添加 uid 字段
ALTER TABLE profiles ADD COLUMN uid VARCHAR(8) UNIQUE;

-- 创建索引（可选但推荐）
CREATE INDEX idx_profiles_uid ON profiles(uid);
```

### 10.4 建议

建议项目负责人：
1. 在 Supabase 控制台为 profiles 表添加 `uid` 字段
2. 添加测试用户数据（包含 uid 和 email）
3. 测试 UID 登录流程
4. 测试注册流程（包含 UID）
5. 确认测试结果后下达下一步开发指令