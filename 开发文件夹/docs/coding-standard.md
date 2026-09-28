# 校园论坛编码规范文档

## 一、概述

本规范定义了校园论坛项目的编码标准和最佳实践，确保代码的一致性、可读性和可维护性。

---

## 二、JavaScript 编码规范

### 2.1 命名规范

#### 2.1.1 变量

- 使用 `camelCase` 命名
- 变量名应具有描述性
- 避免使用缩写，除非是广为人知的缩写（如 `id`, `url`, `api`）

```javascript
// 正确
const userName = '张三';
const postContent = '帖子内容';
const isLoggedIn = true;

// 错误
const un = '张三';
const pc = '帖子内容';
const il = true;
```

#### 2.1.2 常量

- 使用 `UPPER_CASE_SNAKE_CASE` 命名
- 使用 `const` 声明

```javascript
// 正确
const MAX_POST_SIZE = 5 * 1024 * 1024;
const DEFAULT_AVATAR_URL = 'https://api.dicebear.com/7.x/avataaars/svg?seed=';

// 错误
const maxPostSize = 5 * 1024 * 1024;
```

#### 2.1.3 函数

- 使用 `camelCase` 命名
- 函数名应以动词开头
- 具有描述性，说明函数的作用

```javascript
// 正确
function formatDate(date) {
  // ...
}

function getUserProfile(userId) {
  // ...
}

// 错误
function date(date) {
  // ...
}

function user(userId) {
  // ...
}
```

#### 2.1.4 类

- 使用 `PascalCase` 命名
- 类名应为名词

```javascript
// 正确
class UserService {
  // ...
}

class PostManager {
  // ...
}

// 错误
class userService {
  // ...
}
```

#### 2.1.5 文件

- 使用 `kebab-case` 命名
- 小写字母
- 单词之间用连字符 `-` 分隔

```javascript
// 正确
helpers.js
auth-service.js
user-profile.js

// 错误
Helpers.js
authService.js
UserProfile.js
```

### 2.2 语法规范

#### 2.2.1 分号

- 必须使用分号结尾

```javascript
// 正确
const name = '张三';
function greet() {
  return 'Hello';
}

// 错误
const name = '张三'
function greet() {
  return 'Hello'
}
```

#### 2.2.2 大括号

- 大括号必须与关键字在同一行
- 大括号内的代码必须缩进

```javascript
// 正确
if (condition) {
  // code
} else {
  // code
}

function greet() {
  // code
}

// 错误
if (condition)
{
  // code
}

function greet()
{
  // code
}
```

#### 2.2.3 箭头函数

- 当只有一个参数时，可以省略括号
- 当只有一条语句时，可以省略大括号和 `return`

```javascript
// 正确
const users = posts.map(post => post.user);

const doubled = numbers.map(num => num * 2);

// 错误
const users = posts.map((post) => {
  return post.user;
});
```

#### 2.2.4 解构赋值

- 优先使用解构赋值提取对象属性

```javascript
// 正确
const { id, name, email } = user;

const { data, error } = await supabase.from('posts').select('*');

// 错误
const id = user.id;
const name = user.name;
const email = user.email;
```

#### 2.2.5 模板字符串

- 使用模板字符串代替字符串拼接

```javascript
// 正确
const greeting = `Hello, ${name}!`;

const url = `${baseUrl}/api/users/${userId}`;

// 错误
const greeting = 'Hello, ' + name + '!';

const url = baseUrl + '/api/users/' + userId;
```

### 2.3 模块规范

#### 2.3.1 ES Module

- 使用 ES Module (`import`/`export`) 组织代码
- 禁止使用 CommonJS (`require`/`module.exports`)

```javascript
// 正确
import { supabase } from '../config/supabase.js';
export function formatDate(date) { /* ... */ }

// 错误
const supabase = require('../config/supabase.js');
module.exports = { formatDate };
```

#### 2.3.2 默认导出

- 每个模块最多一个默认导出
- 默认导出使用 `export default`

```javascript
// 正确
export default function apiService() {
  // ...
}

// 或
const apiService = { /* ... */ };
export default apiService;
```

#### 2.3.3 命名导出

- 使用命名导出导出多个相关函数

```javascript
// 正确
export function formatDate(date) { /* ... */ }
export function formatRelativeTime(date) { /* ... */ }
```

### 2.4 注释规范

#### 2.4.1 函数注释

- 使用 JSDoc 格式
- 包含功能描述、参数、返回值

```javascript
/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @param {string} format - 格式化字符串
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  // ...
}
```

#### 2.4.2 文件注释

- 文件顶部添加文件说明

```javascript
/**
 * 认证服务层
 * 负责登录、注册、登出等认证相关操作
 */
import { supabase } from '../config/supabase.js';
```

#### 2.4.3 行注释

- 使用 `//` 进行单行注释
- 注释应在代码上方或右侧
- 避免注释掉的代码

```javascript
// 获取用户信息
const user = await getUser(userId);

const count = items.length; // 项目数量

// 错误示例：不要注释掉代码
// const oldValue = 10;
```

### 2.5 错误处理

#### 2.5.1 try-catch

- 使用 `try-catch` 捕获异步操作的异常

```javascript
// 正确
try {
  const { data, error } = await supabase.from('posts').select('*');
  if (error) throw error;
  return data;
} catch (error) {
  console.error('获取帖子失败:', error);
  return [];
}

// 错误
const { data, error } = await supabase.from('posts').select('*');
if (!error) {
  return data;
}
```

#### 2.5.2 错误对象

- 传递完整的错误对象，而不是仅传递错误消息

```javascript
// 正确
catch (error) {
  console.error('Error:', error);
  return { success: false, message: error.message };
}

// 错误
catch (error) {
  console.error('Error:', error.message);
  return { success: false, message: error.message };
}
```

---

## 三、CSS 编码规范

### 3.1 命名规范

#### 3.1.1 类名

- 使用 `kebab-case` 命名
- 小写字母
- 单词之间用连字符 `-` 分隔

```css
/* 正确 */
.card-container {
  /* ... */
}

.user-avatar {
  /* ... */
}

/* 错误 */
.cardContainer {
  /* ... */
}

.userAvatar {
  /* ... */
}
```

#### 3.1.2 ID

- 使用 `kebab-case` 命名
- 尽量避免使用 ID 选择器
- 仅在唯一元素上使用

```css
/* 正确 */
#main-header {
  /* ... */
}

/* 错误 */
#mainHeader {
  /* ... */
}
```

#### 3.1.3 CSS变量

- 使用 `kebab-case` 命名
- 前缀使用 `--`

```css
/* 正确 */
:root {
  --primary-color: #6200EE;
  --secondary-color: #03DAC6;
  --surface-color: #FFFFFF;
}

/* 错误 */
:root {
  --primaryColor: #6200EE;
}
```

### 3.2 语法规范

#### 3.2.1 缩进

- 使用 2 个空格缩进

```css
/* 正确 */
.card {
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 错误 */
.card {
    padding: 16px;
    border-radius: 8px;
}
```

#### 3.2.2 属性顺序

- 按以下顺序排列属性：
  1. 布局属性（display, position, float）
  2. 盒模型属性（width, height, margin, padding）
  3. 背景属性（background）
  4. 文本属性（color, font, text-align）
  5. 其他属性

```css
/* 正确 */
.card {
  display: flex;
  flex-direction: column;
  width: 300px;
  margin: 16px;
  padding: 16px;
  background-color: #FFFFFF;
  color: #1A1A1A;
  font-family: 'Roboto', sans-serif;
  border-radius: 8px;
}
```

#### 3.2.3 简写属性

- 合理使用简写属性，但不要过度简写

```css
/* 正确 */
margin: 16px;
padding: 8px 16px;
background: #FFFFFF url('bg.png') no-repeat center;

/* 错误 - 过度简写 */
margin: 0 16px 0 16px; /* 应使用 margin-x */
```

#### 3.2.4 选择器嵌套

- 使用 BEM 命名规范
- 避免深度嵌套（不超过 3 层）

```css
/* 正确 - BEM */
.card {
  /* ... */
}

.card__title {
  /* ... */
}

.card__content {
  /* ... */
}

.card--highlight {
  /* ... */
}

/* 错误 - 深度嵌套 */
.container .card .content .title {
  /* ... */
}
```

### 3.3 注释规范

#### 3.3.1 块注释

- 使用 `/* */` 进行块注释
- 在主要组件或样式块前添加注释

```css
/* 卡片组件 */
.card {
  /* ... */
}

/* 用户头像 */
.user-avatar {
  /* ... */
}
```

#### 3.3.2 行注释

- 使用 `//` 进行单行注释（如果支持）

```css
.card {
  padding: 16px; /* 内边距 */
  border-radius: 8px;
}
```

---

## 四、HTML 编码规范

### 4.1 命名规范

#### 4.1.1 标签

- 使用小写字母

```html
<!-- 正确 -->
<div class="card">
  <h1>标题</h1>
</div>

<!-- 错误 -->
<DIV class="card">
  <H1>标题</H1>
</DIV>
```

#### 4.1.2 属性

- 使用小写字母
- 属性值使用双引号

```html
<!-- 正确 -->
<input type="text" name="username" id="username">

<!-- 错误 -->
<input TYPE="text" NAME="username" ID='username'>
```

#### 4.1.3 ID 和类名

- 使用 `kebab-case` 命名

```html
<!-- 正确 -->
<div id="main-header" class="card-container">
  <!-- ... -->
</div>

<!-- 错误 -->
<div id="mainHeader" class="cardContainer">
  <!-- ... -->
</div>
```

### 4.2 语法规范

#### 4.2.1 文档结构

- 使用 HTML5 doctype
- 指定语言属性

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>校园论坛</title>
</head>
<body>
  <!-- ... -->
</body>
</html>
```

#### 4.2.2 缩进

- 使用 2 个空格缩进

```html
<div class="card">
  <h2 class="card__title">标题</h2>
  <p class="card__content">内容</p>
</div>
```

#### 4.2.3 闭合标签

- 所有标签必须闭合
- 自闭合标签使用 `/`

```html
<!-- 正确 -->
<div>内容</div>
<img src="image.png" alt="图片">
<input type="text">

<!-- 错误 -->
<div>内容
<img src="image.png">
```

#### 4.2.4 属性顺序

- 按以下顺序排列属性：
  1. id
  2. class
  3. data-*
  4. 其他属性

```html
<!-- 正确 -->
<div id="main-card" class="card" data-id="123">
  <!-- ... -->
</div>

<input type="text" id="username" class="form-input" placeholder="用户名">
```

### 4.3 语义化

#### 4.3.1 使用语义标签

- 使用 HTML5 语义标签代替 div

```html
<!-- 正确 -->
<header>头部</header>
<nav>导航</nav>
<main>主体内容</main>
<article>文章</article>
<section>区块</section>
<footer>页脚</footer>

<!-- 错误 -->
<div class="header">头部</div>
<div class="nav">导航</div>
<div class="main">主体内容</div>
```

---

## 五、数据库编码规范

### 5.1 表名

- 使用小写字母
- 使用复数形式
- 单词之间用下划线 `_` 分隔

```sql
-- 正确
CREATE TABLE users (
  -- ...
);

CREATE TABLE posts (
  -- ...
);

CREATE TABLE comments (
  -- ...
);

-- 错误
CREATE TABLE User (
  -- ...
);

CREATE TABLE post (
  -- ...
);
```

### 5.2 字段名

- 使用小写字母
- 使用单数形式
- 单词之间用下划线 `_` 分隔

```sql
-- 正确
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 错误
CREATE TABLE posts (
  ID UUID PRIMARY KEY,
  UserID UUID REFERENCES users(id),
  Title VARCHAR(200) NOT NULL
);
```

### 5.3 索引名

- 使用 `idx_` 前缀
- 格式：`idx_表名_字段名`

```sql
-- 正确
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);

-- 错误
CREATE INDEX user_id_index ON posts(user_id);
```

### 5.4 约束名

- 使用 `uq_` 前缀表示唯一约束
- 使用 `fk_` 前缀表示外键约束

```sql
-- 正确
ALTER TABLE likes ADD CONSTRAINT uq_likes_user_post UNIQUE (user_id, post_id);
ALTER TABLE posts ADD CONSTRAINT fk_posts_user_id FOREIGN KEY (user_id) REFERENCES users(id);

-- 错误
ALTER TABLE likes ADD CONSTRAINT unique_user_post UNIQUE (user_id, post_id);
```

---

## 六、Git 规范

### 6.1 分支命名

- 使用 `kebab-case` 命名
- 前缀说明：
  - `feature/` - 新功能
  - `fix/` - Bug修复
  - `refactor/` - 重构
  - `docs/` - 文档更新

```bash
# 正确
feature/add-login-page
fix/post-creation-bug
refactor/auth-service
docs/update-api-docs

# 错误
addLoginPage
postBugFix
```

### 6.2 提交信息

- 使用英文或中文
- 格式：`<类型>: <描述>`
- 类型包括：
  - `feat` - 新功能
  - `fix` - Bug修复
  - `refactor` - 重构
  - `docs` - 文档
  - `style` - 代码格式
  - `test` - 测试
  - `chore` - 构建/工具

```bash
# 正确
feat: 添加用户登录功能
fix: 修复帖子创建失败问题
refactor: 重构认证服务
docs: 更新API文档

# 错误
update login page
fixed bug
```

---

## 七、安全规范

### 7.1 XSS 防护

- 对用户输入进行过滤和转义
- 使用 `textContent` 代替 `innerHTML`

```javascript
// 正确
element.textContent = userInput;

// 错误
element.innerHTML = userInput;
```

### 7.2 SQL 注入防护

- 使用参数化查询
- 禁止字符串拼接 SQL

```javascript
// 正确
const { data } = await supabase
  .from('posts')
  .select('*')
  .eq('user_id', userId);

// 错误
const { data } = await supabase
  .from('posts')
  .select('*')
  .eq('user_id', `${userId}`);
```

### 7.3 敏感信息保护

- 不在客户端存储敏感信息
- 不打印敏感信息到控制台

```javascript
// 正确
localStorage.setItem('user_id', userId);

// 错误
localStorage.setItem('password', password);
console.log('用户密码:', password);
```

---

## 八、性能规范

### 8.1 代码优化

- 避免不必要的 DOM 操作
- 使用事件委托
- 避免内存泄漏

```javascript
// 正确 - 事件委托
document.addEventListener('click', (event) => {
  if (event.target.matches('.delete-btn')) {
    // 处理删除
  }
});

// 错误 - 每个元素绑定事件
document.querySelectorAll('.delete-btn').forEach(btn => {
  btn.addEventListener('click', handleDelete);
});
```

### 8.2 图片优化

- 使用合适的图片格式（WebP, AVIF）
- 压缩图片大小
- 使用懒加载

```html
<!-- 正确 -->
<img src="image.webp" alt="图片" loading="lazy">

<!-- 错误 -->
<img src="image.png" alt="图片">
```

---

## 九、版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-05 | 初始编码规范 |