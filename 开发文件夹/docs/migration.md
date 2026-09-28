# 校园论坛数据库迁移文档

## 一、迁移概述

本项目使用 Supabase 作为数据库服务，数据库迁移通过 Supabase SQL Editor 执行。

## 二、迁移文件规范

### 2.1 文件命名
```
YYYYMMDDHHMMSS_description.sql
```

### 2.2 文件结构
```sql
-- 迁移描述
-- 创建日期: YYYY-MM-DD
-- 作者: Author Name

BEGIN;

-- 迁移语句

COMMIT;
```

## 三、迁移历史

### 3.1 初始迁移 (20260705000000)

**文件**: `docs/sql/init.sql`

**内容**:
- 创建 profiles 表
- 创建 categories 表
- 创建 posts 表
- 创建 comments 表
- 创建 likes 表
- 创建 favorites 表
- 创建 notifications 表
- 创建 reports 表
- 创建 admin_logs 表
- 创建索引
- 创建 RLS 策略
- 插入初始数据

### 3.2 图片帖子迁移 (待执行)

**版本**: v0.2.1

**文件**: `docs/sql/20260707000000_add_post_images_table.sql`

**内容**:
- 创建 post_images 表（id, post_id, url, path, file_name, sort_order, created_at）
- 创建索引 idx_post_images_post_id
- 创建索引 idx_post_images_sort_order
- 创建 RLS 策略（SELECT/INSERT/UPDATE/DELETE）

**状态**: Pending（待执行）

**执行方式**:
1. 登录 Supabase Console
2. 打开 SQL Editor
3. 新建查询
4. 粘贴 `docs/sql/20260707000000_add_post_images_table.sql` 内容
5. 执行查询

### 3.3 profiles 表数据迁移 (计划中)

**版本**: v0.1.4

**文件**: `docs/sql/20260710000000_migrate_profiles_data.sql`

**计划**:
- 创建 profiles 数据表
- 创建索引
- 创建 RLS 策略
- 将 Auth user_metadata 中的用户资料同步至 profiles 表
- 更新触发器，确保 Auth metadata 与 profiles 表数据同步

**状态**: Pending（未执行）

**说明**:
当前用户资料（昵称、头像、简介、签名）存储在 Supabase Auth 的 user_metadata 中。
此迁移将数据迁移至独立的 profiles 表，为后续用户主页、搜索、排行榜等功能提供统一数据来源。

### 3.4 扩展迁移 (待开发)

**文件**: `docs/sql/20260715000000_add_follow_table.sql`

**内容**:
- 创建 follows 表
- 创建索引
- 创建 RLS 策略

**状态**: Pending（未执行）## 四、迁移执行

### 4.1 开发环境

```bash
# 连接到本地数据库
psql -U postgres -d campus_forum

# 执行迁移文件
\i docs/sql/init.sql
```

### 4.2 生产环境

1. 登录 Supabase Console
2. 打开 SQL Editor
3. 新建查询
4. 粘贴迁移文件内容
5. 执行查询

## 五、迁移回滚

### 5.1 开发环境

```bash
# 回滚到指定迁移
psql -U postgres -d campus_forum -c "DROP TABLE IF EXISTS ..."
```

### 5.2 生产环境

在 Supabase SQL Editor 中执行回滚语句。

## 六、迁移注意事项

### 6.1 数据安全
- 迁移前备份数据库
- 在测试环境验证迁移

### 6.2 向后兼容
- 新增字段允许为空
- 删除字段前确保无依赖
- 修改字段前验证数据格式

### 6.3 性能考虑
- 大表操作分批执行
- 创建索引时注意锁表
- 避免长时间事务

## 七、迁移清单

### 7.1 必备检查
- [ ] 数据库备份完成
- [ ] 迁移脚本已测试
- [ ] 回滚脚本已准备
- [ ] 测试环境验证通过
- [ ] 业务低峰期执行

### 7.2 执行步骤
1. 备份数据库
2. 在测试环境执行迁移
3. 验证数据完整性
4. 在生产环境执行迁移
5. 验证功能正常
6. 记录迁移日志