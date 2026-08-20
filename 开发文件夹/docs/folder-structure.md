# 校园论坛项目目录结构文档

## 一、项目根目录

```
/Users/yuqiantang/Desktop/BARON/TRAE/
├── 开发需求.rtf              # 开发需求文档
├── UI设计规范.rtf            # UI设计规范文档
├── docs/                     # 项目文档（见下文）
├── 开发文件夹/               # 开发源码（见下文）
└── 服务器上传文件夹/         # 部署目录（见下文）
```

---

## 二、开发文件夹目录结构

```
开发文件夹/
├── assets/                   # 静态资源
│   ├── images/               # 图片资源
│   │   ├── banner/           # 轮播图
│   │   ├── icons/            # 图标图片
│   │   └── placeholder/      # 占位图
│   ├── icons/                # SVG图标
│   ├── fonts/                # 字体文件
│   │   ├── roboto/           # Roboto字体
│   │   └── notosans/         # Noto Sans SC字体
│   └── logo/                 # Logo资源
│       ├── logo.png          # Logo PNG
│       └── logo.svg          # Logo SVG
│
├── components/               # 可复用组件
│   ├── app-bar/              # 顶部导航栏
│   │   ├── app-bar.html
│   │   ├── app-bar.css
│   │   └── app-bar.js
│   ├── bottom-nav/           # 底部导航
│   │   ├── bottom-nav.html
│   │   ├── bottom-nav.css
│   │   └── bottom-nav.js
│   ├── card/                 # 卡片组件
│   │   ├── card.html
│   │   ├── card.css
│   │   └── card.js
│   ├── dialog/               # 对话框
│   │   ├── dialog.html
│   │   ├── dialog.css
│   │   └── dialog.js
│   ├── drawer/               # 侧边抽屉
│   │   ├── drawer.html
│   │   ├── drawer.css
│   │   └── drawer.js
│   ├── fab/                  # 浮动按钮
│   │   ├── fab.html
│   │   ├── fab.css
│   │   └── fab.js
│   ├── form/                 # 表单组件
│   │   ├── input.html
│   │   ├── input.css
│   │   ├── textarea.html
│   │   ├── textarea.css
│   │   └── form-utils.js
│   ├── loading/              # 加载动画
│   │   ├── loading.html
│   │   ├── loading.css
│   │   └── loading.js
│   ├── snackbar/             # 消息提示
│   │   ├── snackbar.html
│   │   ├── snackbar.css
│   │   └── snackbar.js
│   └── avatar/               # 头像组件
│       ├── avatar.html
│       ├── avatar.css
│       └── avatar.js
│
├── config/                   # 配置文件
│   └── supabase.js           # Supabase配置（唯一配置源）
│
├── css/                      # 全局样式
│   ├── reset.css             # 浏览器样式重置
│   ├── variables.css         # CSS变量（颜色、字体、间距）
│   ├── typography.css        # 排版样式
│   ├── layout.css            # 布局样式
│   ├── animation.css         # 动画样式
│   └── responsive.css        # 响应式样式
│
├── js/                       # 页面脚本
│   └── main.js               # 入口脚本（待开发）
│
├── pages/                    # 页面文件
│   ├── index.html            # 首页（待开发）
│   ├── login.html            # 登录页（待开发）
│   ├── register.html         # 注册页（待开发）
│   ├── forum.html            # 论坛页（待开发）
│   ├── post.html             # 帖子详情页（待开发）
│   ├── create-post.html      # 发帖页（待开发）
│   ├── profile.html          # 个人主页（待开发）
│   ├── edit-profile.html     # 编辑资料页（待开发）
│   ├── search.html           # 搜索页（待开发）
│   ├── notifications.html    # 通知页（待开发）
│   ├── admin.html            # 管理后台（待开发）
│   ├── reset-password.html   # 重置密码页（待开发）
│   └── 404.html              # 404页（待开发）
│
├── services/                 # 服务层
│   ├── api.js                # 通用API封装
│   ├── auth.js               # 认证服务（登录/注册/登出）
│   ├── post.js               # 帖子服务（待开发）
│   ├── comment.js            # 评论服务（待开发）
│   ├── user.js               # 用户服务（待开发）
│   ├── notification.js       # 通知服务（待开发）
│   ├── admin.js              # 管理服务（待开发）
│   └── storage.js            # 存储服务（待开发）
│
├── storage/                  # 存储目录（本地开发用）
│   └── .gitkeep              # 占位文件
│
├── styles/                   # 额外样式（预留）
│   └── .gitkeep              # 占位文件
│
├── utils/                    # 工具函数
│   ├── helpers.js            # 通用工具（时间/字符串/图片等）
│   ├── storage.js            # 本地存储封装（LocalStorage/SessionStorage）
│   ├── router.js             # 路由管理（待开发）
│   └── validator.js          # 表单验证（待开发）
│
└── vendor/                   # 第三方库
    ├── supabase/             # Supabase SDK
    ├── markdown/             # Markdown解析库（待开发）
    └── chart/                # 图表库（待开发）
```

---

## 三、docs 目录结构

```
docs/
├── architecture.md           # 项目架构文档
├── database-design.md        # 数据库设计文档
├── api-docs.md               # API接口文档
├── folder-structure.md       # 目录结构文档
├── coding-standard.md        # 编码规范文档
├── changelog.md              # 更新日志（待创建）
├── roadmap.md                # 开发路线图（待创建）
├── deployment.md             # 部署文档（待创建）
├── migration.md              # 数据库迁移文档（待创建）
└── security.md               # 安全文档（待创建）
```

---

## 四、服务器上传文件夹目录结构

```
服务器上传文件夹/
├── assets/                   # 静态资源（仅生产环境需要）
│   ├── images/
│   ├── icons/
│   ├── fonts/
│   └── logo/
├── css/                      # 压缩后的CSS
├── js/                       # 压缩后的JS
├── pages/                    # 页面文件
├── components/               # 组件文件
├── services/                 # 服务文件
├── utils/                    # 工具文件
├── config/                   # 配置文件
├── vendor/                   # 第三方库
└── index.html                # 入口页面
```

**注意**: 部署目录不得包含：
- SQL文件
- 测试代码
- 日志文件
- 开发缓存
- 调试代码
- 无用图片
- 重复文件
- 临时文件
- README文档
- docs文件夹

---

## 五、目录职责说明

### 5.1 assets/

存放项目所需的静态资源文件，包括图片、图标、字体等。

### 5.2 components/

存放可复用的UI组件，每个组件包含HTML、CSS、JS三个文件，实现组件化开发。

### 5.3 config/

存放项目配置文件，所有配置集中管理，避免分散在多个地方。

### 5.4 css/

存放全局CSS样式，包括重置样式、变量定义、排版、布局、动画等。

### 5.5 js/

存放页面级别的JavaScript代码。

### 5.6 pages/

存放各个页面的HTML文件，每个页面对应一个独立的HTML文件。

### 5.7 services/

存放业务逻辑服务层，封装数据库操作和API调用。

### 5.8 storage/

存放本地存储相关的文件（预留）。

### 5.9 styles/

存放额外样式文件（预留）。

### 5.10 utils/

存放通用工具函数，不包含业务逻辑。

### 5.11 vendor/

存放第三方库和SDK。

---

## 六、文件命名规范

### 6.1 HTML文件

- 小写字母
- 单词之间用连字符 `-` 分隔
- 示例：`app-bar.html`, `login.html`

### 6.2 CSS文件

- 小写字母
- 单词之间用连字符 `-` 分隔
- 示例：`app-bar.css`, `variables.css`

### 6.3 JavaScript文件

- 小写字母
- 单词之间用连字符 `-` 分隔
- 示例：`app-bar.js`, `helpers.js`

### 6.4 图片文件

- 小写字母
- 单词之间用连字符 `-` 分隔
- 使用合适的扩展名：`.png`, `.jpg`, `.svg`, `.webp`
- 示例：`logo.png`, `banner-home.jpg`

### 6.5 组件目录

- 组件名称用连字符 `-` 分隔
- 目录内包含同名的HTML、CSS、JS文件
- 示例：`app-bar/app-bar.html`, `app-bar/app-bar.css`, `app-bar/app-bar.js`

---

## 七、文件引用规范

### 7.1 HTML中引用CSS

```html
<link rel="stylesheet" href="../css/variables.css">
<link rel="stylesheet" href="../components/app-bar/app-bar.css">
```

### 7.2 HTML中引用JS

```html
<script type="module" src="../services/api.js"></script>
<script type="module" src="../components/app-bar/app-bar.js"></script>
```

### 7.3 JS中引用模块

```javascript
import { supabase } from '../config/supabase.js';
import { authService } from '../services/auth.js';
import { formatDate } from '../utils/helpers.js';
```

---

## 八、版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-05 | 初始目录结构设计 |