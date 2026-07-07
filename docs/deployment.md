# 校园论坛项目部署文档

## 一、部署环境

### 1.1 前端部署
- **平台**: GitHub Pages
- **分支**: `gh-pages`
- **构建工具**: 无需构建，纯静态文件

### 1.2 后端服务
- **数据库**: Supabase PostgreSQL
- **认证**: Supabase Auth
- **存储**: Supabase Storage

## 二、前置条件

### 2.1 Supabase 配置
1. 创建 Supabase 项目
2. 获取项目 URL 和 Anon Key
3. 创建存储桶（avatars, post-images）
4. 配置 RLS 策略
5. 初始化数据库表

### 2.2 GitHub 配置
1. 创建 GitHub 仓库
2. 配置 GitHub Pages

## 三、部署步骤

### 3.1 配置文件修改

修改 `config/supabase.js`：

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### 3.2 数据库初始化

在 Supabase SQL Editor 中执行 `docs/sql/init.sql`：

```bash
psql -U postgres -d your-database -f docs/sql/init.sql
```

### 3.3 GitHub Pages 部署

#### 方法一：手动部署

```bash
# 构建生产版本
npm run build

# 部署到 gh-pages 分支
git subtree push --prefix 开发文件夹 origin gh-pages
```

#### 方法二：GitHub Actions

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./开发文件夹
```

## 四、环境变量

### 4.1 开发环境

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 4.2 生产环境

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

## 五、数据库迁移

```bash
# 创建迁移文件
npx supabase migration new <migration-name>

# 应用迁移
npx supabase migration up

# 回滚迁移
npx supabase migration down
```

## 六、监控与日志

### 6.1 Supabase 监控
- 访问 Supabase Dashboard
- 查看数据库查询性能
- 监控 Auth 登录情况

### 6.2 前端监控
- 使用 Google Analytics
- 错误日志收集

## 七、常见问题

### 7.1 CORS 问题
确保在 Supabase 控制台配置正确的 CORS 来源。

### 7.2 认证问题
确保使用 Anon Key 而非 Service Key。

### 7.3 图片上传问题
确保存储桶权限配置正确。