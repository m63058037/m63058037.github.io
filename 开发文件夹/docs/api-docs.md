# 校园论坛 API 接口文档

## 一、API概述

本项目使用 Supabase REST API 进行数据交互，所有前端请求必须通过 `services/api.js` 封装层。

### 1.1 基础URL

```
https://your-project-id.supabase.co/rest/v1/
```

### 1.2 认证方式

- **匿名访问**: 使用 Supabase Anon Key
- **用户认证**: 使用 Supabase Auth Token

### 1.3 响应格式

```json
{
  "success": true,
  "data": null,
  "message": "",
  "statusCode": 200
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 请求是否成功 |
| data | any | 返回数据 |
| message | string | 提示信息 |
| statusCode | integer | HTTP状态码 |

---

## 二、认证 API

### 2.1 登录

**POST** `/auth/v1/token?grant_type=password`

请求体：
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "user_metadata": {
        "nickname": "昵称",
        "role": "user",
        "avatar": "url"
      },
      "created_at": "timestamp"
    },
    "session": {
      "access_token": "jwt_token",
      "refresh_token": "refresh_token",
      "expires_at": 1234567890
    }
  },
  "message": "登录成功",
  "statusCode": 200
}
```

### 2.2 注册

**POST** `/auth/v1/signup`

请求体：
```json
{
  "email": "user@example.com",
  "password": "password123",
  "options": {
    "data": {
      "nickname": "昵称",
      "role": "user"
    }
  }
}
```

响应：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "created_at": "timestamp"
    }
  },
  "message": "注册成功，请检查邮箱验证",
  "statusCode": 201
}
```

### 2.3 登出

**POST** `/auth/v1/logout`

响应：
```json
{
  "success": true,
  "data": null,
  "message": "登出成功",
  "statusCode": 200
}
```

### 2.4 获取当前用户

**GET** `/auth/v1/user`

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "user_metadata": {
      "nickname": "昵称",
      "role": "user",
      "avatar": "url"
    },
    "created_at": "timestamp"
  },
  "message": "",
  "statusCode": 200
}
```

### 2.5 重置密码

**POST** `/auth/v1/recover`

请求体：
```json
{
  "email": "user@example.com",
  "options": {
    "redirectTo": "https://example.com/reset-password"
  }
}
```

响应：
```json
{
  "success": true,
  "data": null,
  "message": "重置密码链接已发送",
  "statusCode": 200
}
```

---

## 三、用户资料 API

### 3.1 获取用户列表

**GET** `/profiles`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| select | string | 选择字段，默认 `*` |
| order | string | 排序，如 `created_at.desc` |
| limit | integer | 限制数量 |
| offset | integer | 偏移量 |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "nickname": "昵称",
      "avatar": "url",
      "role": "user",
      "bio": "个人简介",
      "created_at": "timestamp"
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 3.2 获取单个用户

**GET** `/profiles?id=eq.uuid`

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "nickname": "昵称",
    "avatar": "url",
    "role": "user",
    "bio": "个人简介",
    "posts_count": 10,
    "comments_count": 20,
    "created_at": "timestamp"
  },
  "message": "",
  "statusCode": 200
}
```

### 3.3 更新用户资料

**PATCH** `/profiles?id=eq.uuid`

请求体：
```json
{
  "nickname": "新昵称",
  "avatar": "new_avatar_url",
  "bio": "新简介"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "nickname": "新昵称",
    "avatar": "new_avatar_url",
    "bio": "新简介"
  },
  "message": "更新成功",
  "statusCode": 200
}
```

---

## 四、帖子 API

### 4.1 获取帖子列表

**GET** `/posts`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| select | string | 选择字段，默认 `*` |
| category_id | string | 分类ID过滤 |
| user_id | string | 用户ID过滤 |
| is_deleted | string | 是否删除，默认 `false` |
| order | string | 排序，如 `created_at.desc` |
| limit | integer | 限制数量 |
| offset | integer | 偏移量 |

响应：
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "category_id": "uuid",
        "title": "帖子标题",
        "content": "帖子内容",
        "excerpt": "帖子摘要",
        "images": ["url1", "url2"],
        "tags": ["tag1", "tag2"],
        "is_pinned": false,
        "views_count": 100,
        "likes_count": 10,
        "comments_count": 5,
        "created_at": "timestamp"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 100,
      "totalPages": 10
    }
  },
  "message": "",
  "statusCode": 200
}
```

### 4.2 获取单个帖子

**GET** `/posts?id=eq.uuid`

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "category_id": "uuid",
    "title": "帖子标题",
    "content": "帖子内容",
    "images": ["url1"],
    "tags": ["tag1"],
    "views_count": 100,
    "likes_count": 10,
    "comments_count": 5,
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  "message": "",
  "statusCode": 200
}
```

### 4.3 创建帖子

**POST** `/posts`

请求体：
```json
{
  "user_id": "uuid",
  "category_id": "uuid",
  "title": "帖子标题",
  "content": "帖子内容",
  "excerpt": "帖子摘要",
  "images": ["url1", "url2"],
  "tags": ["tag1", "tag2"]
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "帖子标题",
    "content": "帖子内容",
    "created_at": "timestamp"
  },
  "message": "创建成功",
  "statusCode": 201
}
```

### 4.4 更新帖子

**PATCH** `/posts?id=eq.uuid`

请求体：
```json
{
  "title": "新标题",
  "content": "新内容",
  "tags": ["new_tag"]
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "新标题",
    "content": "新内容",
    "updated_at": "timestamp"
  },
  "message": "更新成功",
  "statusCode": 200
}
```

### 4.5 删除帖子（软删除）

**PATCH** `/posts?id=eq.uuid`

请求体：
```json
{
  "is_deleted": true
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "is_deleted": true
  },
  "message": "删除成功",
  "statusCode": 200
}
```

---

## 五、评论 API

### 5.1 获取评论列表

**GET** `/comments`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| post_id | string | 帖子ID（必填） |
| parent_id | string | 父评论ID（回复） |
| is_deleted | string | 是否删除，默认 `false` |
| order | string | 排序，如 `created_at.asc` |
| limit | integer | 限制数量 |
| offset | integer | 偏移量 |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "post_id": "uuid",
      "user_id": "uuid",
      "parent_id": null,
      "content": "评论内容",
      "likes_count": 5,
      "replies_count": 2,
      "created_at": "timestamp"
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 5.2 创建评论

**POST** `/comments`

请求体：
```json
{
  "post_id": "uuid",
  "user_id": "uuid",
  "parent_id": "uuid",
  "content": "评论内容"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "post_id": "uuid",
    "user_id": "uuid",
    "content": "评论内容",
    "created_at": "timestamp"
  },
  "message": "评论成功",
  "statusCode": 201
}
```

### 5.3 更新评论

**PATCH** `/comments?id=eq.uuid`

请求体：
```json
{
  "content": "新评论内容"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "content": "新评论内容",
    "updated_at": "timestamp"
  },
  "message": "更新成功",
  "statusCode": 200
}
```

### 5.4 删除评论（软删除）

**PATCH** `/comments?id=eq.uuid`

请求体：
```json
{
  "is_deleted": true
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "is_deleted": true
  },
  "message": "删除成功",
  "statusCode": 200
}
```

---

## 六、点赞 API

### 6.1 获取点赞记录

**GET** `/likes`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户ID |
| post_id | string | 帖子ID |
| comment_id | string | 评论ID |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "post_id": "uuid",
      "comment_id": null,
      "created_at": "timestamp"
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 6.2 点赞

**POST** `/likes`

请求体（帖子点赞）：
```json
{
  "user_id": "uuid",
  "post_id": "uuid"
}
```

请求体（评论点赞）：
```json
{
  "user_id": "uuid",
  "comment_id": "uuid"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "post_id": "uuid",
    "created_at": "timestamp"
  },
  "message": "点赞成功",
  "statusCode": 201
}
```

### 6.3 取消点赞

**DELETE** `/likes?id=eq.uuid`

响应：
```json
{
  "success": true,
  "data": null,
  "message": "取消点赞成功",
  "statusCode": 200
}
```

---

## 七、收藏 API

### 7.1 获取收藏列表

**GET** `/favorites`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户ID（必填） |
| order | string | 排序，如 `created_at.desc` |
| limit | integer | 限制数量 |
| offset | integer | 偏移量 |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "post_id": "uuid",
      "created_at": "timestamp"
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 7.2 收藏

**POST** `/favorites`

请求体：
```json
{
  "user_id": "uuid",
  "post_id": "uuid"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "post_id": "uuid",
    "created_at": "timestamp"
  },
  "message": "收藏成功",
  "statusCode": 201
}
```

### 7.3 取消收藏

**DELETE** `/favorites?id=eq.uuid`

响应：
```json
{
  "success": true,
  "data": null,
  "message": "取消收藏成功",
  "statusCode": 200
}
```

---

## 八、分类 API

### 8.1 获取分类列表

**GET** `/categories`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| is_active | string | 是否启用，默认 `true` |
| order | string | 排序，如 `order.asc` |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "分类名称",
      "slug": "category-slug",
      "description": "分类描述",
      "icon": "icon_name",
      "color": "#6200EE",
      "posts_count": 100,
      "is_active": true,
      "order": 1
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 8.2 获取单个分类

**GET** `/categories?id=eq.uuid`

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "分类名称",
    "slug": "category-slug",
    "description": "分类描述",
    "posts_count": 100
  },
  "message": "",
  "statusCode": 200
}
```

### 8.3 创建分类（管理员）

**POST** `/categories`

请求体：
```json
{
  "name": "分类名称",
  "slug": "category-slug",
  "description": "分类描述",
  "icon": "icon_name",
  "color": "#6200EE",
  "order": 1
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "分类名称",
    "created_at": "timestamp"
  },
  "message": "创建成功",
  "statusCode": 201
}
```

### 8.4 更新分类（管理员）

**PATCH** `/categories?id=eq.uuid`

请求体：
```json
{
  "name": "新名称",
  "description": "新描述"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "新名称",
    "updated_at": "timestamp"
  },
  "message": "更新成功",
  "statusCode": 200
}
```

### 8.5 删除分类（管理员）

**DELETE** `/categories?id=eq.uuid`

响应：
```json
{
  "success": true,
  "data": null,
  "message": "删除成功",
  "statusCode": 200
}
```

---

## 九、通知 API

### 9.1 获取通知列表

**GET** `/notifications`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户ID（必填） |
| is_read | string | 是否已读 |
| order | string | 排序，如 `created_at.desc` |
| limit | integer | 限制数量 |
| offset | integer | 偏移量 |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "like",
      "related_user_id": "uuid",
      "related_post_id": "uuid",
      "content": "用户xxx赞了你的帖子",
      "is_read": false,
      "created_at": "timestamp"
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 9.2 标记已读

**PATCH** `/notifications?user_id=eq.uuid`

请求体：
```json
{
  "is_read": true
}
```

响应：
```json
{
  "success": true,
  "data": null,
  "message": "标记成功",
  "statusCode": 200
}
```

---

## 十、举报 API

### 10.1 获取举报列表（管理员）

**GET** `/reports`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 状态：pending/approved/rejected |
| order | string | 排序，如 `created_at.desc` |
| limit | integer | 限制数量 |
| offset | integer | 偏移量 |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "target_type": "post",
      "target_id": "uuid",
      "reason": "违规内容",
      "detail": "详细说明",
      "status": "pending",
      "created_at": "timestamp"
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 10.2 创建举报

**POST** `/reports`

请求体：
```json
{
  "user_id": "uuid",
  "target_type": "post",
  "target_id": "uuid",
  "reason": "违规内容",
  "detail": "详细说明"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "pending",
    "created_at": "timestamp"
  },
  "message": "举报成功",
  "statusCode": 201
}
```

### 10.3 处理举报（管理员）

**PATCH** `/reports?id=eq.uuid`

请求体：
```json
{
  "status": "approved",
  "processed_by": "admin_uuid"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "approved",
    "processed_at": "timestamp"
  },
  "message": "处理成功",
  "statusCode": 200
}
```

---

## 十一、管理员日志 API

### 11.1 获取日志列表（管理员）

**GET** `/admin_logs`

查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| admin_id | string | 管理员ID |
| action | string | 操作类型 |
| target_type | string | 目标类型 |
| order | string | 排序，如 `created_at.desc` |
| limit | integer | 限制数量 |
| offset | integer | 偏移量 |

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "admin_id": "uuid",
      "action": "ban",
      "target_type": "user",
      "target_id": "uuid",
      "target_name": "用户名",
      "detail": "封禁用户xxx",
      "ip_address": "127.0.0.1",
      "created_at": "timestamp"
    }
  ],
  "message": "",
  "statusCode": 200
}
```

### 11.2 创建日志（自动）

**POST** `/admin_logs`

请求体：
```json
{
  "admin_id": "uuid",
  "action": "create",
  "target_type": "post",
  "target_id": "uuid",
  "target_name": "帖子标题",
  "detail": "创建帖子",
  "ip_address": "127.0.0.1",
  "user_agent": "Mozilla/5.0"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "created_at": "timestamp"
  },
  "message": "日志记录成功",
  "statusCode": 201
}
```

---

## 十二、错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证/登录过期 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 冲突（如重复点赞） |
| 500 | 服务器错误 |

---

## 十三、版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-05 | 初始API文档 |