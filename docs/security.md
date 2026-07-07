# 校园论坛安全文档

## 一、安全概述

本项目遵循安全开发最佳实践，确保用户数据安全和系统稳定性。

## 二、认证安全

### 2.1 Supabase Auth
- 使用 Supabase Auth 进行用户认证
- 密码由 Supabase 自动加密存储
- 使用 JWT Token 进行会话管理
- 定期刷新 Token

### 2.2 Token 管理
- Access Token 存储在 localStorage/sessionStorage
- Refresh Token 用于获取新的 Access Token
- 登出时清除所有 Token

## 三、数据安全

### 3.1 Row Level Security (RLS)
- 所有表启用 RLS
- 用户只能访问自己的数据
- 管理员可以访问所有数据

### 3.2 参数化查询
- 使用 Supabase 查询构建器
- 避免 SQL 字符串拼接
- 防止 SQL 注入攻击

### 3.3 敏感数据保护
- 不在客户端存储敏感信息
- 密码通过 HTTPS 传输
- API Key 不在前端暴露

## 四、前端安全

### 4.1 XSS 防护
- 使用 `textContent` 代替 `innerHTML`
- 对用户输入进行过滤和转义
- 使用 DOMPurify 清理富文本内容

### 4.2 CSRF 防护
- 使用 SameSite Cookie
- 验证请求来源
- 使用 Token 验证

### 4.3 CSP (Content Security Policy)
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: https://*.supabase.co;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co;
```

## 五、存储安全

### 5.1 文件上传验证
- 验证文件类型
- 限制文件大小
- 重命名上传文件
- 压缩图片

### 5.2 存储桶权限
- Public 桶用于公开访问的图片
- Private 桶用于用户私有文件
- 使用 Signed URL 访问私有文件

## 六、API 安全

### 6.1 Rate Limiting
- 限制登录尝试次数
- 限制 API 请求频率
- 使用 Supabase 内置限流

### 6.2 权限验证
- 每个 API 请求验证用户权限
- 使用 RLS 控制数据访问
- 管理员操作记录日志

### 6.3 HTTPS
- 所有 API 请求使用 HTTPS
- 强制 HTTPS 重定向

## 七、服务器安全

### 7.1 Supabase 安全
- 启用 Supabase 安全功能
- 定期更新 Supabase 配置
- 监控异常活动

### 7.2 GitHub Pages
- 使用 HTTPS
- 配置 CSP
- 定期更新依赖

## 八、安全检查清单

### 8.1 开发阶段
- [ ] 代码审查时检查安全问题
- [ ] 使用静态分析工具
- [ ] 验证输入数据
- [ ] 保护敏感信息

### 8.2 部署阶段
- [ ] 配置 HTTPS
- [ ] 启用 RLS
- [ ] 配置 CSP
- [ ] 限制 API 权限

### 8.3 运维阶段
- [ ] 定期安全审计
- [ ] 监控异常访问
- [ ] 更新安全补丁
- [ ] 备份数据

## 九、安全事件响应

### 9.1 检测
- 监控 Supabase 日志
- 检测异常登录
- 检测异常 API 请求

### 9.2 响应
- 立即禁用受影响账户
- 通知用户更改密码
- 记录安全事件

### 9.3 恢复
- 恢复数据备份
- 修复安全漏洞
- 更新安全策略