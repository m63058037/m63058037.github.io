# 校园论坛项目 - 对话历史总结

> 更新时间：2026-08-25 | 当前阶段：第五阶段「上线准备」进行中

---

## 1. 核心诉求与意图

| 阶段 | 核心目标 | 关键约束 |
|------|----------|----------|
| **第四阶段（已完成）** | 修复管理员后台核心功能缺陷，闭环举报处理业务 | 严禁硬编码、绕过 Service、使用 service_role、硬编码 admin UID |
| **第四阶段归档发布** | 将验收版组装到服务器上传文件夹 → force push GitHub main → 更新 GitHub Pages | 仅推送「服务器上传文件夹」内容，不含开发目录、node_modules、docs、SQL |
| **第五阶段（进行中）** | 完成 8 项上线准备任务，产出可发布制品 | **严禁 Git 提交/推送、数据库变更、服务器同步**；仅限开发/修复/自检/测试/整理/报告 |

---

## 2. 第四阶段关键修复记录（4 轮迭代）

| 轮次 | 问题 | 根因 | 修复位置 | 验收状态 |
|------|------|------|----------|----------|
| 1 | 数据总览全 0 | RPC 返回数组，前端直接用 `response.data` 导致字段 undefined | `services/admin.js:getDashboardStats()` 加数组索引解析 | ✅ |
| 1 | 忘记密码审核 400 | `admin_get_password_resets` SQL 中 `status` 字段歧义（参数名与列名冲突） | Migration `20260824000000` 用 `prr.status` 限定 | ✅ |
| 2 | 仅剩忘记密码 400 | 同上，确认仅此一项 | 同上 | ✅ |
| 3 | 评论面板拖拽失效/数量不匹配/touchmove 警告 | 1) 仅支持下拉关闭 2) `eq.null` 非法 3) 非 cancelable 事件 `preventDefault` | `js/post-detail.js` 重写触摸状态机、`services/api.js` 新增 `applyFilter(null→is.null)` | ✅ |
| 4 | 举报说明显示「无」/缺「定位举报」/返回导航断裂 | 1) 部署版 RPC 未别名 `content→description` 2) 无跳转入口 3) `history.back()` 回到发帖页 | `services/admin.js` 兼容双字段 + Migration `20260825000000` 强制对齐、`js/admin.js` 新增定位按钮、`js/post-detail.js` 三态来源感知返回 | ✅ |
| 4 | 举报处理业务闭环缺失 | `admin_handle_report` 仅改状态 | Migration `20260825000001` 重建：删帖+举报人通知+作者警告+状态更新 | ✅ |

---

## 3. 第五阶段 8 项任务进度

| # | 任务 | 状态 | 产出物 |
|---|------|------|--------|
| 1 | **性能优化**（首屏/分页/图片/缓存/并发） | 🔄 审查完成，待修复应用 | 性能审查报告 + 修复清单 |
| 2 | **安全检查**（XSS/越权/RPC/敏感信息/输入验证） | 🔄 审查完成，待修复应用 | 安全审查报告 + 修复清单 |
| 3 | **RLS 综合验收**（全表策略/边界/回归） | ⏳ 待开始 | RLS 验收报告 |
| 4 | **Migration 整理**（依赖/顺序/冲突/幂等） | ⏳ 待开始 | 可执行部署方案（不执行） |
| 5 | **GitHub Pages 部署检查**（结构/路径/引用） | ⏳ 待开始 | 部署结构核对表 |
| 6 | **文档整理**（架构/部署/目录角色区分） | ⏳ 待开始 | 更新后开发文档 |
| 7 | **Beta 测试准备**（清单/账号/反馈/回滚） | ⏳ 待开始 | Beta 检查清单 |
| 8 | **Release v1.0 风险清单**（P0-P3 分级） | ⏳ 待开始 | 风险清单文档 |

> 📌 **当前进度**：自动静态扫描完成；性能/安全两项深层审查代理已返回结果；用户流程/响应式审查代理结果待收集；其余 5 项任务未启动。

---

## 4. 核心文件变更清单

### 高频修改文件（开发目录 `/Users/myys01/Desktop/BARON/TRAE/`）

| 文件 | 修改轮次 | 核心变更 |
|------|----------|----------|
| `services/admin.js` | 4 | `getDashboardStats` 数组解析、`getReports` description 兼容、`getPasswordResets` 字段映射 |
| `js/admin.js` | 3 | 忘记密码字段映射修正、新增「定位举报」按钮及跳转、操作区三按钮响应式渲染 |
| `services/api.js` | 1 | 新增 `applyFilter`：`null → .is(key, null)` 修复 PostgREST 400 |
| `js/post-detail.js` | 3 | 评论面板触摸状态机重写、三态来源感知返回（create-post/admin-reports/普通）、并行加载优化建议 |
| `css/styles.css` | 1 | 底部面板动态高度 `var(--sheet-h, 62dvh)`、`.admin-item-actions` flex-wrap + 44px 触控高度 |
| `pages/post-detail.html` | 2 | 资源版本号 `?v=20260825-1` / `?v=20260825-2` 刷新缓存 |
| `utils/helpers.js` | 0 (待修) | `escapeHtml` 仍含 `/` 转义，导致图片 URL 解析异常 |
| `services/auth.js` | 0 (待修) | `getUsersInfo` 暴露敏感字段（student_number/class_number/cohort/role/account_status） |

### Migration 文件（开发目录 `/docs/sql/`）

| 文件 | 用途 | 关键 SQL 片段 |
|------|------|---------------|
| `20260824000000_fix_admin_password_reset_rpcs.sql` | 修正 `status` 歧义 | `SELECT COUNT(*) FROM password_reset_requests prr WHERE prr.status = p_status` |
| `20260825000000_fix_admin_get_reports_description.sql` | 强制返回 description | `SELECT r.content as description FROM reports r ...` |
| `20260825000001_fix_admin_handle_report_full.sql` | 重建处理闭环 | `UPDATE posts SET is_deleted=true...; INSERT INTO system_messages...; UPDATE reports SET status...` |

---

## 5. 已发现待修复真实 Bug（来自静态扫描 + 深层审查）

| 文件 | 问题 | 严重度 | 建议修复 |
|------|------|--------|----------|
| `utils/helpers.js` | `escapeHtml` 转义 `/` 破坏图片 URL | P1 | 移除 `.replace(/\//g, '&#x2F;')`，保留 `& < > " '` |
| `services/auth.js` | `getUsersInfo` 返回敏感 profile 字段 | P1 | 仅返回 `id, nickname, avatar` 等公开字段 |
| `js/post-detail.js` | 初始化串行 `await`，可并行 `Promise.all` | P2 | `await Promise.all([loadPost(), loadComments(), loadReactions()])` |
| 多处 | 重复 `getUsersInfo([uid])` 单条查询 | P2 | 批量收集 UID → 单次 `getUsersInfo(uids)` → 本地 Map 复用 |
| `js/feed.js` | 无限滚动无节流/去抖 | P2 | 加 300ms 防抖 + `loading` 互斥锁 |
| 图片资源 | 无 `loading=lazy` / `srcset` / WebP | P2 | `<img loading="lazy" srcset="...webp" ...>` |
| `services/report.js` | `submitReport` 缺输入长度/类型校验 | P2 | 前端 500 字限制 + 后端 RPC `CHECK (length(content) <= 500)` |
| `services/admin.js` | RPC 调用无 `try-catch` 统一错误处理 | P3 | 统一包装 `safeRpc(fn, args)` 返回 `{success, data, error}` |

---

## 6. 发布流程锚点（第四阶段已验收）

```
开发根目录 (/Users/myys01/Desktop/BARON/TRAE/)
    │
    ├── 同步验收版 → 服务器上传文件夹 (/www/wwwroot/bbs.univlink.cn/)  [rsync --delete 纯净]
    │       │
    │       ├── 清理：删除 node_modules、docs、.git、SQL、*.md、*.sh
    │       └── 验收：仅保留 pages/ js/ css/ services/ utils/ config/ images/ 等运行时资源
    │
    └── 独立 Git 仓库（服务器上传文件夹内） force push → GitHub main (univlink-bbs)
            │
            └── GitHub Actions 自动部署 → GitHub Pages (bbs.univlink.cn)
```

> ⚠️ 第五阶段**严禁**执行上述任何发布动作，仅产出检查报告与修复代码，等待人工验收后由用户决定发布时机。

---

## 7. 关键技术决策与约束

| 领域 | 决策/约束 | 依据 |
|------|-----------|------|
| 权限模型 | 仅用 `ANON_KEY` + RLS，前端不持有 `service_role` | 零信任，防越权 |
| 数据查询 | 统一走 Service → RPC/查询，禁直接 `supabase.from()` | 便于审计、统一错误处理、迁移解耦 |
| Migration | 幂等 `DROP IF EXISTS + CREATE OR REPLACE` | 可重复执行、回滚安全 |
| 响应式 | 断点 768/600/480px，CSS 变量控制面板高度 | 单代码库多端、无横向滚动 |
| 导航状态 | 显式 `from=` 参数三态（create-post/admin-reports/普通） | 避免 `history.back()` 循环、语义清晰 |
| 版本管理 | HTML 引用 `?v=YYYYMMDD-N` 刷新缓存 | 无构建工具、零配置强制更新 |

---

## 8. 下一步行动建议（按优先级）

1. **收集第三个代理（用户流程/响应式）审查结果** → 合并三份审查报告
2. **应用 P1 级修复**：`escapeHtml` 去 `/` 转义、`getUsersInfo` 脱敏
3. **应用 P2 级性能修复**：并行初始化、用户查询去重、无限滚动节流、图片懒加载
4. **启动 Migration 全面整理** → 产出依赖图 + 执行顺序 + 回滚方案
5. **GitHub Pages 结构扫描** → 根目录纯净性、相对路径、资源引用完整性
6. **文档同步**：将第五阶段架构/部署/目录角色写入开发文档
7. **产出交付物**：Beta 检查清单 + Release v1.0 风险清单 (P0-P3)
8. **汇总八项任务报告** → 提交用户验收

---

## 9. 关键路径提醒

- **无自主发布权**：所有 Git/数据库/服务器操作需用户显式批准
- **仅开发目录为真源**：服务器上传文件夹是组装产物，GitHub main 是唯一发布源
- **RLS 为安全底线**：任何查询/修改必通过 RLS 验收，前端不可绕过
- **版本号即缓存控制**：每次修改 JS/CSS 必须同步 bump HTML 中 `?v=`