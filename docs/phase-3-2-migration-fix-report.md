# 第三阶段-2 数据库迁移修复报告

## 一、AI回复规范声明

我已重新阅读《开发需求.txt》《UI设计规范.txt》《项目开发总规则.md》，本次开发严格遵循三份文档。

---

## 二、原错误原因

### 2.1 错误信息

```
ERROR: 42804: foreign key constraint "post_images_post_id_fkey" cannot be implemented
DETAIL: Key columns "post_id" and "id" are of incompatible types: uuid and character varying.
```

### 2.2 根本原因

迁移文件中 `post_images.post_id` 字段定义为 `UUID` 类型，但实际数据库中 `posts.id` 字段类型为 `character varying（varchar）`。

PostgreSQL 要求外键关联的字段类型必须完全一致，因此无法创建外键约束。

### 2.3 问题分析

| 项目 | 设计文档 | 实际数据库 | 迁移文件 |
|------|----------|------------|----------|
| posts.id | uuid | varchar | - |
| post_images.post_id | uuid | - | uuid |

数据库设计文档中 `posts.id` 设计为 `uuid`，但实际创建时使用了 `varchar`，迁移文件未与实际数据库结构对齐。

---

## 三、数据库结构确认结果

### 3.1 实际数据库表结构

**posts 表：**

| 字段 | 实际类型 |
|------|----------|
| id | character varying |
| user_id | character varying |
| category_id | character varying |
| title | varchar(200) |
| content | text |
| ... | ... |

### 3.2 确认原则

以实际数据库结构为准，迁移文件必须适配现有表结构，而非强制要求数据库适配设计文档。

---

## 四、修改文件

### 4.1 修改文件列表

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `docs/sql/20260707000000_add_post_images_table.sql` | 修改 | 修正 post_images 表字段类型 |
| `docs/database-design.md` | 修改 | 更新 post_images 表设计文档 |

### 4.2 修改内容

#### 4.2.1 迁移文件修改

**修改前：**

```sql
CREATE TABLE IF NOT EXISTS post_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  ...
);
```

**修改后：**

```sql
CREATE TABLE IF NOT EXISTS post_images (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id VARCHAR REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  ...
);
```

**修改说明：**
- `id` 字段类型从 `UUID` 改为 `VARCHAR`
- `post_id` 字段类型从 `UUID` 改为 `VARCHAR`
- 保持 `DEFAULT gen_random_uuid()` 生成 UUID 格式的字符串值
- 保持外键关联 `REFERENCES posts(id)`

#### 4.2.2 设计文档修改

**修改前：**

| 字段名 | 类型 |
|--------|------|
| `id` | `uuid` |
| `post_id` | `uuid` |
| `image_url` | `varchar(500)` |
| `image_path` | `varchar(500)` |
| `file_name` | `varchar(255)` |
| ... | ... |

**修改后：**

| 字段名 | 类型 |
|--------|------|
| `id` | `varchar` |
| `post_id` | `varchar` |
| `url` | `text` |
| `path` | `text` |
| `file_name` | `text` |
| ... | ... |

**修改说明：**
- `id` 类型从 `uuid` 改为 `varchar`
- `post_id` 类型从 `uuid` 改为 `varchar`
- `image_url` 改为 `url`，类型从 `varchar(500)` 改为 `text`
- `image_path` 改为 `path`，类型从 `varchar(500)` 改为 `text`
- `file_name` 类型从 `varchar(255)` 改为 `text`

---

## 五、SQL 执行测试结果

### 5.1 测试步骤

1. 登录 Supabase Console
2. 打开 SQL Editor
3. 新建查询
4. 粘贴修改后的 `docs/sql/20260707000000_add_post_images_table.sql` 内容
5. 执行查询

### 5.2 预期结果

| 测试项 | 预期结果 |
|--------|----------|
| 表创建 | post_images 表创建成功 |
| 外键约束 | post_id 外键关联 posts(id) 成功 |
| 索引创建 | idx_post_images_post_id 创建成功 |
| 索引创建 | idx_post_images_sort_order 创建成功 |
| RLS 启用 | ENABLE ROW LEVEL SECURITY 成功 |
| SELECT 策略 | "Users can view images of published posts" 创建成功 |
| INSERT 策略 | "Users can insert their own post images" 创建成功 |
| UPDATE 策略 | "Users can update their own post images" 创建成功 |
| DELETE 策略 | "Users can delete their own post images" 创建成功 |

### 5.3 当前状态

**测试结果**: ⏳ 待执行

等待项目负责人在 Supabase 中执行修改后的迁移文件，并确认执行结果。

---

## 六、关联关系确认

### 6.1 外键关系

```
posts.id (varchar)
    │
    └───> post_images.post_id (varchar)
          ON DELETE CASCADE
```

### 6.2 级联删除

当 `posts` 表中的帖子被删除时，`post_images` 表中关联的图片记录将自动级联删除。

---

## 七、后续建议

### 7.1 设计文档同步

建议后续定期检查设计文档与实际数据库结构的一致性，避免类似问题再次发生。

### 7.2 类型统一

建议在项目初期确定主键类型规范（uuid 或 varchar），并保持所有表的主键类型一致。

### 7.3 迁移前验证

建议在执行数据库迁移前，先通过 SQL 查询确认目标表的实际结构：

```sql
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'posts';
```

---

## 八、修复完成确认

| 项目 | 状态 |
|------|------|
| 迁移文件修复 | ✅ 完成 |
| 设计文档更新 | ✅ 完成 |
| SQL 执行测试 | ⏳ 待项目负责人执行 |
| 功能验收 | ⏳ 等待测试结果 |

修复完成，请项目负责人在 Supabase 中执行修改后的迁移文件 `docs/sql/20260707000000_add_post_images_table.sql`，并确认执行结果。