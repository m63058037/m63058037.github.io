# 校园论坛项目审计报告

审计日期：2026-07-28
审计范围：全部 HTML、CSS、JavaScript、Service、Components、Utils、Config、SQL Migration
审计方法：逐文件完整阅读，交叉验证

---

问题统计：
P0（阻塞）：13 个
P1（严重）：24 个
P2（一般）：35 个
P3（优化）：30 个
合计：102 个

---

# 一、P0 阻塞性问题（13 个）

## P0-01 XSS 漏洞：innerHTML 拼接用户可控数据

等级：P0
位置：
- components/feed.js 第 80-130 行（createPostElement）
- js/my-posts.js 第 92-132 行（createPostElement）
- components/right-sidebar.js 第 47-53 行（renderHotPosts）
- components/header.js 第 70-75 行（renderCategories）
- components/sidebar.js 第 37-43 行（renderCategories）
- js/post.js 第 204-210 行（renderImagePreview）

影响范围：全站帖子列表、帖子详情、分类列表、热门帖子、图片预览

产生原因：大量使用 innerHTML 模板字符串直接拼接来自数据库的用户输入（帖子标题、内容摘要、昵称、标签、分类名称等），未做任何 HTML 转义。如果用户在帖子标题中注入恶意脚本代码，将直接在浏览器中执行。

根因追踪：utils/helpers.js 中有 stripHtml 函数但只做移除标签，缺少 escapeHtml 函数。这是整个项目的系统性遗漏，不是单个文件的疏忽。所有使用 innerHTML 拼接用户数据的地方都存在此漏洞。

建议修复方案：
1. 在 utils/helpers.js 中新增 escapeHtml 函数
2. 所有动态文本内容通过 escapeHtml 处理后再拼接
3. 或者改用 DOM API（createElement + textContent）构建元素

是否建议立即修复：是


## P0-02 post.js _attachUserInfo 使用 supabase.auth.admin.getUserById（客户端不可用）

等级：P0
位置：services/post.js 第 284 行

影响范围：帖子列表（首页、我的帖子）、帖子详情页，所有需要展示作者昵称和头像的场景

产生原因：supabase.auth.admin.getUserById 属于 Admin API，必须使用 service_role 密钥初始化的客户端才能调用。config/supabase.js 只用 anon 公钥初始化，浏览器端调用会直接返回 401/403，永远拿不到用户信息。

根因追踪：
- 第 282-295 行 for 循环逐个查询用户，每次都调用 admin API
- admin API 失败后 users 对象为空
- 第 297-300 行 fallback 分支将所有作者显示为"用户"，头像为 null
- 这是整个"帖子无法显示作者信息"的根因

关联问题：
- 依赖 P0-04（profiles 表未创建），修复此问题需要先创建 profiles 表
- 关联 P2-17（N+1 查询性能问题，修复后仍需优化为批量查询）

建议修复方案：改用 profiles 表查询
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar')
      .in('id', userIds);

是否建议立即修复：是


## P0-03 SQL 迁移文件包含 ALTER FUNCTION ... OWNER TO supabase_admin

等级：P0
位置：
- docs/sql/20260711000000_create_posts_table.sql 第 56 行
- docs/sql/20260711000004_migrate_posts_table.sql 第 74 行

影响范围：执行迁移时会报权限错误，increment_post_views 函数无法正常创建

产生原因：项目规范明确要求"迁移脚本不得包含 SET ROLE supabase_admin 或 ALTER FUNCTION ... OWNER TO supabase_admin"，但这两个文件仍保留了该语句。Supabase SQL Editor 不允许项目用户执行这些操作。

建议修复方案：删除所有 ALTER FUNCTION ... OWNER TO supabase_admin 语句

是否建议立即修复：是


## P0-04 关键数据库表未创建（profiles、post_likes、comments）

等级：P0
位置：docs/sql/20260711000007_create_profiles_table.sql（待执行）

影响范围：P0-02 的修复依赖 profiles 表；评论、点赞功能也依赖 comments/post_likes 表

产生原因：SQL 迁移文件已编写但均未在 Supabase 中执行。迁移文档中标注为 Pending。

关联问题：
- 阻塞 P0-02 修复（profiles 表不存在则无法查询用户信息）
- 阻塞评论功能（comments 表不存在）
- 阻塞点赞功能（post_likes 表不存在）

建议修复方案：在 Supabase SQL Editor 中按顺序执行迁移文件（执行前需先修复 P0-03、P0-05、P0-06 等阻塞性问题）

是否建议立即修复：是


## P0-05 comments 表被两个迁移文件重复创建（结构不一致）

等级：P0
位置：
- docs/sql/20260711000006_create_interaction_tables.sql 第 29-36 行（comments 表，post_id UUID）
- docs/sql/20260711000009_create_comments_table.sql 第 1-9 行（comments 表，post_id VARCHAR(36)）

影响范围：执行迁移时冲突；字段类型不一致导致外键关联失败

产生原因：两个文件都创建 comments 表，且 post_id 类型不一致。posts.id 是 UUID，所以 20260711000009 的 VARCHAR(36) 版本无法建立外键。

根因追踪：
- posts.id 类型为 UUID（20260711000000 和 20260711000005）
- post_images.post_id 类型为 UUID（20260707000000 和 20260711000005）
- post_likes.post_id 类型为 UUID（20260711000006）
- comments.post_id 类型为 UUID（20260711000006）vs VARCHAR(36)（20260711000009）
- 项目记忆中记录"post_id as varchar type"与实际 SQL 矛盾

建议修复方案：删除 20260711000009_create_comments_table.sql，统一使用 20260711000006 中的 UUID 版本

是否建议立即修复：是


## P0-06 20260711000006 迁移文件不幂等（缺少 IF NOT EXISTS）

等级：P0
位置：docs/sql/20260711000006_create_interaction_tables.sql 第 1 行、第 29 行

影响范围：重复执行会报"relation already exists"错误

产生原因：post_likes 和 comments 表的 CREATE TABLE 均无 IF NOT EXISTS，POLICY 也未使用 DROP IF EXISTS 保护。违反项目规范"迁移脚本必须幂等"。

建议修复方案：改为 CREATE TABLE IF NOT EXISTS，对 POLICY 增加 DROP POLICY IF EXISTS

是否建议立即修复：是


## P0-07 20260711000005 迁移文件使用 DROP TABLE 删除数据

等级：P0
位置：docs/sql/20260711000005_rebuild_posts_tables.sql 第 1-3 行

影响范围：执行该文件会删除 posts 和 post_images 表及所有数据

产生原因：使用 DROP TABLE IF EXISTS post_images; DROP TABLE IF EXISTS posts; 然后 CREATE，属于破坏性重建。项目规范明确要求"数据库迁移不得删除已有帖子、覆盖数据、修改主键"。

建议修复方案：标记为废弃或仅在首次初始化时使用，生产环境严禁执行

是否建议立即修复：是（标注废弃/危险）


## P0-08 管理员初始化 SQL 使用 auth.admin.create_user（需 service_role）

等级：P0
位置：docs/sql/20260707000002_create_admin_user.sql 第 2 行

影响范围：在 Supabase SQL Editor 执行会失败

产生原因：auth.admin.create_user 是内部函数，需要 service_role 权限。SQL Editor 默认以 postgres 角色运行，可能无权调用 auth schema 的 admin 函数。

建议修复方案：改用 Supabase Dashboard 的 Authentication 页面手动创建管理员

是否建议立即修复：是


## P0-09 评论功能完全未实现（空壳）

等级：P0
位置：
- js/post-detail.js 第 133-135 行（loadComments 硬编码返回"暂无评论"）
- js/post-detail.js 第 173 行（commentSubmitBtn 只显示"评论功能开发中"）

影响范围：帖子详情页，评论是论坛核心功能

产生原因：评论输入框和提交按钮存在于 HTML 中，但点击只显示"开发中"。loadComments 永远显示"暂无评论"，从未调用后端 API。services/comment.js 不存在。

关联问题：
- 数据库 comments 表 SQL 已编写但未执行（P0-04）
- comments 表迁移文件冲突（P0-05）
- permission.js 中已定义 CREATE_COMMENT 权限但无调用方

建议修复方案：实现完整的评论 CRUD（新增 commentService，对接数据库 comments 表）

是否建议立即修复：是


## P0-10 搜索功能完全未实现（占位 setTimeout）

等级：P0
位置：js/search.js 第 53-65 行

影响范围：搜索页所有用户

产生原因：performSearch 方法用 setTimeout 模拟 500ms 延迟后直接显示"未找到相关内容"，从未调用任何搜索 API。过滤器按钮切换后也调用同一个空方法，完全忽略 currentFilter。postService 中也没有搜索方法。

建议修复方案：在 postService 中新增 searchPosts 方法，对接后端全文搜索或 like 查询

是否建议立即修复：是


## P0-11 img 标签 src 为空字符串

等级：P0
位置：
- pages/home.html 第 60 行
- pages/post-detail.html 第 41 行
- pages/profile.html 第 18 行

影响范围：所有页面

产生原因：img src="" 空字符串会导致浏览器发起对当前页面 URL 的请求，产生 404 或重复请求。虽然 JS 后续会设置正确的 src，但在 JS 执行前会产生无效请求。

建议修复方案：使用占位图的 data URI，如 src="data:image/svg+xml,..."

是否建议立即修复：是


## P0-12 CSS 变量 --md-sys-color-warning 未定义

等级：P0
位置：
- css/styles.css 第 710 行、第 714 行（使用处）
- css/styles.css 第 1-81 行（定义处，无此变量）

影响范围：注册页密码强度指示器

产生原因：strength-segment.strength-3 使用 var(--md-sys-color-warning)，但 :root 中没有定义这个变量。浏览器使用回退值，导致中等强度密码的颜色不显示。

关联问题：密码强度指示器的 CSS 逻辑本身也有问题（P1-19），需要一并检查 register.js 中如何添加/移除 strength-N 类

建议修复方案：在 :root 和暗色模式中添加 --md-sys-color-warning 变量定义

是否建议立即修复：是


## P0-13 Google Fonts 阻塞渲染（国内访问严重拖慢）

等级：P0
位置：所有 HTML 文件的 head（如 login.html 第 7-9 行）

影响范围：首次内容渲染时间（FCP），国内所有用户

产生原因：加载 8 种字重的 Roboto + Noto Sans SC 字体。Noto Sans SC 是中文字体，体积可达数 MB，且请求 Google Fonts 在国内可能被墙，导致页面长时间空白。

根因追踪：assets/fonts/notosans/ 和 assets/fonts/roboto/ 目录已存在但只有 .gitkeep，说明本地化字体是计划但未完成。

建议修复方案：将字体文件本地化到 assets/fonts/ 目录，减少字重数量到 2-3 种

是否建议立即修复：是

---

# 二、P1 严重问题（24 个）

## P1-01 收藏功能完全未实现（占位 setTimeout）

等级：P1
位置：js/favorites.js 第 40-49 行

影响范围：收藏页面

产生原因：整个收藏页面是空壳，用 setTimeout 假装加载 500ms 后直接显示"无收藏"。没有任何 service 调用。services/favorite.js 不存在。utils/storage.js 中定义了 STORAGE_KEYS.FAVORITE_POSTS 但从未被使用。

建议修复方案：实现收藏 service 层或暂时隐藏入口

是否建议立即修复：是


## P1-02 举报功能未实现（空壳按钮）

等级：P1
位置：js/post-detail.js 第 171 行

影响范围：帖子详情页

产生原因：举报按钮只弹"举报功能开发中"提示。permission.js 中已定义 MANAGE_REPORTS 权限，说明设计上有此功能。

建议修复方案：实现举报功能或隐藏按钮

是否建议立即修复：是


## P1-03 post-detail.js 帖子图片和分类未渲染

等级：P1
位置：js/post-detail.js 第 17-20 行（DOM 引用）、第 75-131 行（loadPost）

影响范围：帖子详情页

产生原因：
- detailCategory（第17行）：获取了引用但 loadPost 中完全未使用
- detailImages（第20行）：获取了引用但未调用 postService.getPostImages()，帖子图片不显示
- moreButton（第29行）：获取了引用但 bindEvents 中未绑定事件

根因追踪：postService.getPostImages 方法已在 services/post.js 第 254-271 行实现，但前端从未调用

建议修复方案：在 loadPost 中补充 getPostImages 调用和图片渲染逻辑

是否建议立即修复：是


## P1-04 post-detail.js 删除帖子缺少管理员权限校验

等级：P1
位置：js/post-detail.js 第 125-128 行、第 149-161 行

影响范围：帖子详情页

产生原因：只判断了作者本人，没有考虑管理员/版主也可以删除。permissionService.canDeletePost 已实现但未被调用。后端 postService.deletePost 也只检查 user_id，管理员同样无法删除。

关联问题：services/post.js 的 deletePost（第160-189行）和 updatePost（第121-158行）都只检查 user_id !== userId，管理员/版主角色被忽略，与 permissionService 的设计矛盾

建议修复方案：前端使用 permissionService.canDeletePost 判断，后端增加管理员/版主角色判断

是否建议立即修复：是


## P1-05 post.js 不支持编辑模式

等级：P1
位置：js/post.js 全文

影响范围：发帖/编辑页面

产生原因：post-detail.js 第 164 行 handleEdit 跳转到 post.html?id=xxx，但 post.js 中完全没有读取 URL 参数 id 的逻辑，也没有加载已有帖子数据。进入 post.html 带 id 参数时仍然是新建帖子行为。

建议修复方案：在 post.js 中添加编辑模式：读取 URL id 参数，加载帖子数据填充表单，提交时调用 updatePost

是否建议立即修复：是


## P1-06 post.js category_id 永远传 null（发帖页缺少分类选择器）

等级：P1
位置：js/post.js 第 104-109 行

影响范围：发帖功能

产生原因：createPost 的第三个参数 category_id 硬编码为 null。post.html 中没有分类选择器的 DOM。CSS 中已定义 .category-select-wrapper、.form-select、.select-icon 样式但未使用（死代码）。

关联问题：
- 与 P1-07 关联：post.js createPost/updatePost 中 category_id 引用已移除的数据库字段
- CSS 死代码：css/styles.css 第 1990-2035 行

建议修复方案：在 post.html 中添加分类选择器，或确认分类系统是否保留

是否建议立即修复：是


## P1-07 post.js createPost/updatePost 中 category_id 引用已移除的数据库字段

等级：P1
位置：services/post.js 第 87 行、第 89 行、第 142 行、第 144 行

影响范围：插入/更新帖子时会写入不存在的字段，导致数据库报错

产生原因：项目规范明确"分类系统已移除，posts 表不得包含 category_id 字段"。SQL 迁移 20260711000000 第 22 行已执行 ALTER TABLE posts DROP COLUMN IF EXISTS category_id。但 post.js 仍在写入该字段。

建议修复方案：删除 post.js 中所有 category_id 相关代码

是否建议立即修复：是


## P1-08 right-sidebar.js 统计数据字段名不匹配

等级：P1
位置：components/right-sidebar.js 第 56-76 行

影响范围：首页右侧栏统计数据

产生原因：
- pagination.totalItems 永远是 undefined（api.js 返回的字段是 total 不是 totalItems），导致总帖子数永远显示 0
- totalComments 和 totalUsers 直接硬编码为 0

建议修复方案：修正字段名为 pagination.total，新增统计 API

是否建议立即修复：是


## P1-09 post-detail.js 点赞和收藏按钮无功能

等级：P1
位置：pages/post-detail.html 第 69-80 行

影响范围：帖子详情页

产生原因：HTML 中有 detailLikeBtn 和 detailFavoriteBtn 元素，但 post-detail.js 中没有获取这两个元素引用，也没有绑定任何事件。services/like.js 和 services/favorite.js 均不存在。

建议修复方案：实现点赞和收藏功能

是否建议立即修复：是


## P1-10 忘记密码链接指向空锚点

等级：P1
位置：pages/login.html 第 82 行

影响范围：登录页所有用户

产生原因：a href="#" 点击后页面跳到顶部，无任何功能

建议修复方案：实现密码重置流程页面，或暂时移除该链接

是否建议立即修复：是


## P1-11 CSS 移动端断点内大量重复样式（约 370 行）

等级：P1
位置：css/styles.css 第 2290-2656 行

影响范围：CSS 维护性

产生原因：max-width: 600px 媒体查询内部完整复制了约 25 个选择器的完整定义，与第 1854-2220 行的 PC 端定义完全相同。任何样式修改都需要同步两处。

建议修复方案：删除移动端断点内的重复样式，仅保留需要差异化的样式

是否建议立即修复：是


## P1-12 auth.js 权限判断完全基于 user_metadata（客户端可篡改）

等级：P1
位置：services/auth.js 第 180-193 行、第 220-232 行、第 270-282 行

影响范围：管理员权限判断可被前端伪造

产生原因：isAdmin、isSuperAdmin 等方法直接读取 user.user_metadata.is_admin/role。客户端可通过修改 localStorage 中的 session 影响 getUser 返回值。真正的权限应通过 RLS 策略或服务端校验。

建议修复方案：关键操作必须依赖数据库 RLS 策略，前端权限判断仅用于 UI 显示控制

是否建议立即修复：是


## P1-13 post.js createPost 的 catch 块引用未定义变量

等级：P1
位置：services/post.js 第 115 行

影响范围：若 getCurrentUser 之前的代码抛错，userResponse 未定义，catch 块中 userResponse.data?.id 会抛 ReferenceError

产生原因：userResponse 在 try 块内第 76 行声明，catch 块第 115 行引用。若第 76 行之前就抛错，userResponse 为 undefined。

建议修复方案：在 try 外声明 let userResponse 或 catch 中用 typeof 判断

是否建议立即修复：是


## P1-14 categories 表 RLS 策略允许所有登录用户增删改

等级：P1
位置：docs/sql/20260707000001_create_categories_table.sql 第 22-29 行

影响范围：任何登录用户都能创建/修改/删除分类

产生原因：策略注释写"Admin can"，但实际条件是 TO authenticated USING (true)，即所有登录用户均可操作。

建议修复方案：增加管理员判断条件

是否建议立即修复：是（若保留分类系统）


## P1-15 post_images 表外键引用顺序问题

等级：P1
位置：docs/sql/20260707000000_add_post_images_table.sql 第 3 行

影响范围：若先执行此文件再执行 posts 表创建，外键引用失败

产生原因：文件名时间戳 20260707000000 早于 posts 表创建（20260711000000），但 post_images 外键 REFERENCES posts(id) 依赖 posts 表存在。

建议修复方案：调整执行顺序，先创建 posts 表再创建 post_images

是否建议立即修复：是


## P1-16 storage.js getPublicUrl 错误处理逻辑错误

等级：P1
位置：services/storage.js 第 150-157 行

影响范围：error 永远为 undefined，错误判断无效

产生原因：Supabase 的 getPublicUrl 是同步方法，返回 { data: { publicUrl } }，不返回 error 字段。代码却解构了 error 并判断。

建议修复方案：移除 error 判断

是否建议立即修复：否


## P1-17 category.js 及相关分类代码为死代码

等级：P1
位置：services/category.js（整个文件）、services/permission.js 中 CATEGORY 相关定义

影响范围：死代码，维护负担

产生原因：分类系统已移除，但 categoryService 和权限定义仍保留

建议修复方案：删除 category.js 文件，移除 permission.js 中所有 CATEGORY 权限定义

是否建议立即修复：否


## P1-18 createResponse 函数在 5 个 Service 文件中重复定义

等级：P1
位置：
- services/api.js 第 11-18 行
- services/auth.js 第 13-20 行
- services/post.js 第 6-13 行
- services/storage.js 第 3-10 行
- services/category.js 第 3-10 行

影响范围：代码重复，维护时容易遗漏

建议修复方案：抽取到 utils/response.js 统一导出

是否建议立即修复：否


## P1-19 密码强度指示器 CSS 逻辑有误

等级：P1
位置：css/styles.css 第 697-723 行

影响范围：注册页密码强度显示

产生原因：strength-2 设置所有 segment 为红色，但 :nth-child(-n+2) 只设置前 2 个为红色，后面的会覆盖前面的。实际效果可能不符合预期。

建议修复方案：重新设计 CSS 逻辑，确保每个强度级别正确显示对应数量的 segment

是否建议立即修复：是


## P1-20 .form-textarea 重复定义导致 profile 页面 textarea 过高

等级：P1
位置：css/styles.css 第 919 行和第 2083 行

影响范围：个人资料页面的 textarea 高度

产生原因：第 919 行定义 min-height: 6rem（profile 页面），第 2083 行定义 min-height: 200px（post 页面），后者覆盖前者。profile.html 的 textarea 也带有 .form-textarea 类，导致高度被错误设为 200px。

建议修复方案：使用更具体的选择器或不同类名区分

是否建议立即修复：是


## P1-21 post-detail.js checkSession 未抛出异常导致后续代码继续执行

等级：P1
位置：js/post.js 第 37-42 行

影响范围：发帖页面

产生原因：checkSession 中 window.location.href 赋值后没有 throw 也没有 return，导致 bindEvents 仍然执行，尝试访问可能不存在的 DOM 元素。对比其他文件（如 post-detail.js 第 63 行有 throw），post.js 缺少此保护。

建议修复方案：添加 throw new Error 或在 init 中检查返回值

是否建议立即修复：是


## P1-22 my-posts.js tab 切换功能未生效

等级：P1
位置：js/my-posts.js 第 8 行、第 197-205 行

影响范围：我的帖子页面

产生原因：currentTab 定义了但 loadPosts 方法中完全没有使用。tab 切换后只是 UI 上的 active class 变化，数据不会变。postService.getUserPosts 也不支持状态过滤参数。

建议修复方案：根据 currentTab 添加过滤条件

是否建议立即修复：是


## P1-23 20260711000005 索引无 IF NOT EXISTS

等级：P1
位置：docs/sql/20260711000005_rebuild_posts_tables.sql 第 24-28 行、第 61-62 行

影响范围：若表已存在则索引创建失败

建议修复方案：增加 IF NOT EXISTS 或直接废弃该文件

是否建议立即修复：否


## P1-24 SQL 迁移文件普遍缺少 BEGIN/COMMIT 事务包裹

等级：P1
位置：所有 10 个 SQL 文件

影响范围：执行中途失败会导致数据库处于不一致状态

建议修复方案：在每个迁移文件外层包裹 BEGIN; ... COMMIT;

是否建议立即修复：否

---

# 三、P2 一般问题（35 个）

## P2-01 formatTime 函数在 3 个文件中重复定义

位置：
- js/post-detail.js 第 137-147 行
- js/my-posts.js 第 137-146 行
- components/feed.js 第 151-167 行

产生原因：三个文件各自实现了几乎完全相同的时间格式化方法。utils/helpers.js 中已有 formatRelativeTime 函数但未被使用。

建议修复方案：统一使用 utils/helpers.js 中的 formatRelativeTime

是否建议立即修复：是


## P2-02 showSnackbar / hideSnackbar 在 9 个文件中重复定义

位置：js/login.js、js/register.js、js/profile.js、js/home.js、js/post.js、js/post-detail.js、js/my-posts.js、js/favorites.js、js/search.js

产生原因：每个页面类都定义了完全相同的 showSnackbar 和 hideSnackbar 方法。

建议修复方案：创建 BasePage 基类或 SnackbarManager 单例

是否建议立即修复：是


## P2-03 goBack 函数在 5 个文件中重复定义

位置：js/post.js、js/post-detail.js、js/my-posts.js、js/favorites.js、js/search.js

建议修复方案：放入 BasePage 基类

是否建议立即修复：是


## P2-04 checkSession 函数在 9 个文件中重复定义

位置：所有页面 JS 文件

产生原因：每个页面都定义了几乎相同的 checkSession 方法，只在跳转目标上有细微差异。

建议修复方案：创建 BasePage 基类，提供 requireAuth 和 requireGuest 方法

是否建议立即修复：是


## P2-05 getCurrentUser 函数在 6 个文件中重复定义

位置：js/login.js、js/register.js、js/profile.js、js/home.js、js/post-detail.js、js/my-posts.js

建议修复方案：同上，放入基类

是否建议立即修复：是


## P2-06 createPostElement 在 my-posts.js 和 feed.js 中重复

位置：
- js/my-posts.js 第 86-135 行
- components/feed.js 第 64-133 行

产生原因：两个文件都实现了帖子卡片的 HTML 构建，逻辑高度相似，但 feed.js 版本更完整（包含图片预览和热门标记），my-posts.js 版本缺少图片预览。

建议修复方案：抽取为 PostCardComponent 共享组件

是否建议立即修复：是


## P2-07 所有事件监听器从未移除（内存泄漏隐患）

位置：所有 js/ 和 components/ 文件

产生原因：全项目没有任何 removeEventListener 调用。虽然是多页面应用，页面切换时卸载 DOM，但 snackbar 的 setTimeout 定时器会累积，无法清除。

建议修复方案：snackbar 定时器改为可清除的

是否建议立即修复：是（定时器问题）


## P2-08 post.js 中图片 ID 生成方式不可靠

位置：js/post.js 第 188 行

产生原因：id: Date.now() + Math.random() 生成浮点数作为 ID，快速连续添加时可能相同。

建议修复方案：使用 crypto.randomUUID()

是否建议立即修复：否


## P2-09 post.js savePostImages 传参字段名不匹配

位置：js/post.js 第 131 行；services/post.js 第 227-252 行

产生原因：storageService 返回 fileName/sortOrder，postService 映射为 file_name/sort_order，字段命名不统一。

是否建议立即修复：否


## P2-10 my-posts.js 中 createPostElement 缺少 excerpt 空值处理

位置：js/my-posts.js 第 105 行

产生原因：post.excerpt 为 null 时页面显示 "null"。对比 feed.js 第 99 行有兜底。

建议修复方案：添加空值处理

是否建议立即修复：是


## P2-11 post-detail.js 中 detailBadges 不清空，重复添加

位置：js/post-detail.js 第 103-114 行

产生原因：loadPost 中 appendChild 添加 badge，若多次调用会重复累积。

建议修复方案：添加前先 innerHTML = ''

是否建议立即修复：否


## P2-12 post-detail.js 中 detailTags 不清空

位置：js/post-detail.js 第 116-123 行

同 P2-11

是否建议立即修复：否


## P2-13 postId 为 null 时 loading 状态不关闭

位置：js/post-detail.js 第 76-79 行

产生原因：URL 没有 id 参数时，showSnackbar 后直接 return，loading 状态没有关闭，页面永远显示"加载中"

建议修复方案：在 return 前关闭 loading

是否建议立即修复：否


## P2-14 用户协议和隐私政策链接指向空锚点

位置：pages/register.html 第 132 行、第 134 行

是否建议立即修复：否（法律合规风险，建议尽快）


## P2-15 moreButton 无功能

位置：pages/post-detail.html 第 22-27 行，js/post-detail.js 第 29 行

产生原因：获取了引用但未绑定事件

是否建议立即修复：否


## P2-16 首页"记住我"选项未实现

位置：pages/login.html 第 78 行

产生原因：login.html 有 rememberMe checkbox，但 login.js 从未读取该值

是否建议立即修复：否


## P2-17 _attachUserInfo 中 N+1 查询性能问题

位置：services/post.js 第 282-295 行

产生原因：for 循环逐个查询用户，10 个不同作者就是 10 次串行请求。

建议修复方案：改为批量查询（修复 P0-02 后用 profiles.select().in()）

是否建议立即修复：否


## P2-18 right-sidebar.js loadHotPosts 不是真正的热门帖子

位置：components/right-sidebar.js 第 25-39 行

产生原因：调用 getPosts(1, 5) 获取最新 5 条帖子，不是按热度排序

是否建议立即修复：否


## P2-19 right-sidebar.js loadStats 方法设计不合理

位置：components/right-sidebar.js 第 56-76 行

产生原因：为获取总帖子数调用 getPosts(1, 1)，且 totalComments/totalUsers 硬编码为 0

是否建议立即修复：否


## P2-20 统计信息中"总评论"和"总用户"永远为 0

位置：components/right-sidebar.js 第 69-70 行

是否建议立即修复：否


## P2-21 "最新回复"模块无数据加载

位置：pages/home.html 第 190-193 行

产生原因：right-sidebar.js 获取了 latestComments 引用但没有调用任何方法

是否建议立即修复：否


## P2-22 缺少平板断点（768px）

位置：css/styles.css 全局

产生原因：只有 1024px 和 600px 两个断点，缺少 768px 平板断点

是否建议立即修复：否


## P2-23 首页在 1024px 以下右侧栏直接消失

位置：css/styles.css 第 2222-2230 行

产生原因：right-sidebar display: none，没有提供替代入口

是否建议立即修复：否


## P2-24 sidebar 在 PC 端不可用（只能抽屉式）

位置：css/styles.css 第 1308-1317 行

是否建议立即修复：否


## P2-25 image-remove-btn 触摸区域过小

位置：css/styles.css 第 2187-2213 行

产生原因：删除按钮 32x32px，低于 Apple HIG 建议的 44x44px

是否建议立即修复：否


## P2-26 sidebar 在移动端打开时 body 不锁定滚动

位置：components/sidebar.js

产生原因：侧边栏打开时没有给 body 添加 overflow: hidden

是否建议立即修复：否


## P2-27 图片无懒加载

位置：所有 img 标签

产生原因：没有 loading="lazy" 属性

是否建议立即修复：否


## P2-28 外部依赖 dicebear API 生成头像

位置：js/post-detail.js 第 93 行、components/header.js 第 59 行、js/profile.js 第 94 行、js/my-posts.js 第 95 行

产生原因：使用 https://api.dicebear.com 外部 API 生成头像，依赖第三方服务

是否建议立即修复：否


## P2-29 FileReader 读取大图片为 base64 可能导致内存溢出

位置：js/post.js 第 183-194 行

产生原因：readAsDataURL 将图片转为 base64，多张大图片导致内存占用过高

建议修复方案：使用 URL.createObjectURL

是否建议立即修复：否


## P2-30 CSS 文件体积过大（3021 行）

位置：css/styles.css

产生原因：所有页面样式集中在一个文件中，且有大量重复代码

是否建议立即修复：否


## P2-31 缺少图片加载错误处理

位置：所有 img 标签

产生原因：没有 onerror 处理，图片加载失败时显示破碎图标

是否建议立即修复：否


## P2-32 所有页面 Snackbar HTML 结构完全重复

位置：每个 HTML 文件中的 snackbar-container 块

是否建议立即修复：否


## P2-33 .form-error 重复定义

位置：css/styles.css 第 343 行和第 2215 行

是否建议立即修复：否


## P2-34 .section-title 重复定义（语义不同）

位置：css/styles.css 第 910 行和第 1400 行

是否建议立即修复：否


## P2-35 所有页面 snackbar 的 ID 完全相同

位置：所有 HTML 文件的 id="snackbar"

是否建议立即修复：否

---

# 四、P3 优化问题（30 个）

## P3-01 大量 console.log/error/warn 未删除（60+ 处）

位置：services/ 目录约 61 处，js/ 目录约 14 处，components/ 目录约 7 处

产生原因：项目已有 loggerService 但未统一使用

建议修复方案：统一用 loggerService，生产环境移除 console

是否建议立即修复：否


## P3-02 api.js transaction 方法无法实现真正事务

位置：services/api.js 第 311-319 行

产生原因：只是顺序执行 callback，无回滚能力

是否建议立即修复：否


## P3-03 api.js insert/update/delete 的 returning 参数处理不当

位置：services/api.js 第 87 行、第 123 行、第 158 行

是否建议立即修复：否


## P3-04 logger.js logDatabase 的 result 参数语义混乱

位置：services/logger.js 第 144-162 行

是否建议立即修复：否


## P3-05 helpers.js getThumbnailUrl 实际未做缩略图转换

位置：utils/helpers.js 第 174-180 行

产生原因：replace 前后字符串相同，无效果

是否建议立即修复：否


## P3-06 helpers.js deepClone 未处理特殊对象

位置：utils/helpers.js 第 243-256 行

建议修复方案：使用 structuredClone()

是否建议立即修复：否


## P3-07 utils/storage.js getSize 计算不准确

位置：utils/storage.js 第 99 行、第 205 行

是否建议立即修复：否


## P3-08 config/supabase.js 硬编码配置值

位置：config/supabase.js 第 1-2 行、第 17-25 行

是否建议立即修复：否


## P3-09 auth.js ADMIN_UIDS 硬编码且与 config 重复

位置：services/auth.js 第 34 行；config/supabase.js 第 17 行

是否建议立即修复：否


## P3-10 post.js getPosts 的 categoryId 参数为死参数

位置：services/post.js 第 16 行、第 27-29 行

是否建议立即修复：否


## P3-11 register.js showSuccessSnackbar 不会自动消失

位置：js/register.js 第 335-338 行

是否建议立即修复：否


## P3-12 post-detail.js incrementViews 未 await 且未处理错误

位置：js/post-detail.js 第 130 行

是否建议立即修复：否


## P3-13 header.js handleCategoryClick 和 setActiveCategory 逻辑重复

位置：components/header.js 第 81-94 行、第 96-107 行

是否建议立即修复：否


## P3-14 sidebar.js 分类点击事件绑定在 li 而非 a 标签

位置：components/sidebar.js 第 45-50 行

是否建议立即修复：否


## P3-15 header.js userMenuButton 只跳转到 profile，缺少下拉菜单

位置：components/header.js 第 131-133 行

是否建议立即修复：否


## P3-16 缺少 -webkit-tap-highlight-color 设置

位置：css/styles.css 全局

是否建议立即修复：否


## P3-17 category-scroll 隐藏滚动条但无替代指示

位置：css/styles.css 第 1264-1266 行

是否建议立即修复：否


## P3-18 缺少 -webkit-overflow-scrolling: touch

位置：css/styles.css 第 1254-1262 行、第 1340-1350 行

是否建议立即修复：否


## P3-19 back-button 触摸区域偏小

位置：css/styles.css 第 1878-1890 行

是否建议立即修复：否


## P3-20 backdrop-filter 缺少 -webkit- 前缀

位置：css/styles.css 第 1072 行、第 1870 行

是否建议立即修复：否


## P3-21 @keyframes spin 重复定义

位置：css/styles.css 第 469 行和第 1491 行

是否建议立即修复：否


## P3-22 .checkbox-input transform 重复被覆盖

位置：css/styles.css 第 380-391 行

是否建议立即修复：否


## P3-23 !important 使用

位置：css/styles.css 第 2067 行、第 2503 行

是否建议立即修复：否


## P3-24 search-button 在首页 PC 端被隐藏

位置：css/styles.css 第 1168-1174 行

是否建议立即修复：否


## P3-25 缺少 main 语义标签

位置：pages/login.html、pages/register.html、pages/profile.html

是否建议立即修复：否


## P3-26 缺少 favicon

位置：所有 HTML 文件

是否建议立即修复：否


## P3-27 缺少 meta description

位置：所有 HTML 文件

是否建议立即修复：否


## P3-28 缺少 noscript 支持

位置：所有 HTML 文件

是否建议立即修复：否


## P3-29 index.html 双重重定向可能冲突

位置：index.html 第 7-9 行

是否建议立即修复：否


## P3-30 缺少构建工具和打包流程

位置：项目全局

是否建议立即修复：否

---

# 五、系统性问题总结

## 1. 缺少基类设计

所有页面类（LoginPage, RegisterPage, ProfilePage, HomePage, PostPage 等）都独立实现了 checkSession、getCurrentUser、showSnackbar、hideSnackbar、goBack、formatTime 等公共方法。重复代码超过 300 行。建议创建 BasePage 基类。


## 2. 功能完成度低

在 9 个页面中：
- 3 个页面功能完全未实现（收藏、搜索、评论）
- 1 个功能是空壳按钮（举报）
- 1 个页面入口存在但逻辑缺失（编辑帖子）
- 2 个按钮无事件绑定（点赞、收藏）
- 1 个 tab 切换不生效（我的帖子）
- 1 个编辑跳转后无编辑逻辑（发帖页）

项目整体完成度约 60%。


## 3. XSS 防护全面缺失

全项目 22 处 innerHTML 拼接中，大部分涉及用户可控数据，且缺少 escapeHtml 函数。这是最需要立即修复的安全问题。


## 4. 前端使用 Admin API

postService._attachUserInfo 使用 supabase.auth.admin.getUserById，在前端会失败，导致所有帖子作者信息都回退为默认值"用户"。


## 5. 权限系统形同虚设

项目有完整的 permissionService（services/permission.js，330+ 行），定义了详细的权限矩阵，但前端页面中从未 import 或调用过 permissionService。所有权限判断都是内联的 currentUser.id === post.user_id，完全忽略了管理员/版主角色。


## 6. SQL 迁移问题集中

- 2 个文件包含禁止的 OWNER 语句
- 2 个文件重复创建 comments 表且类型不一致
- 多个文件不幂等
- 1 个文件使用破坏性 DROP TABLE
- 全部缺少事务包裹
- 迁移执行顺序有依赖问题


## 7. 分类系统残留混乱

SQL 已 DROP category_id 字段，但 post.js 仍写入该字段，category.js 仍为活跃代码，permission.js 中仍有分类权限定义。三处不一致。


## 8. 数据库表大量未创建

profiles、post_likes、comments 表的 SQL 已编写但均未执行，阻塞了用户信息显示、评论、点赞功能。


## 9. 字体依赖外部 CDN

所有页面加载 Google Fonts，在国内会被墙导致页面长时间空白。字体本地化目录已创建但未填充文件。


## 10. CSS 文件臃肿且重复

3021 行 CSS 集中在一个文件中，移动端断点内约 370 行是完全重复的 PC 端定义。多个选择器重复定义。

---

# 六、问题关联链（根因追踪）

## 链 1：帖子作者信息不显示

P0-02 (post.js 用 admin API)
  根因：客户端无 service_role，无法调用 auth.admin
  依赖：P0-04 (profiles 表未创建)
  修复后：P2-17 (N+1 查询性能问题仍需优化)


## 链 2：comments 表迁移冲突

P0-05 (两文件重复创建 comments)
  根因：P0-05 (post_id 类型不一致 UUID vs VARCHAR)
  根因：项目记忆与实际 SQL 关于 varchar 的记录矛盾
  关联：P0-06 (06 文件不幂等)


## 链 3：分类系统残留

P1-07 (post.js 写 category_id)
  根因：P1-17 (category.js 死代码)
  根因：SQL 已 DROP COLUMN category_id
  影响：createPost/updatePost 可能因字段不存在而失败


## 链 4：迁移执行阻塞

P0-03 (ALTER FUNCTION OWNER 禁止)
  阻塞：P0-04 (profiles 等表无法创建)
  阻塞：P0-02 修复方案无法实施（profiles 表不存在）
  阻塞：评论/点赞功能（P0-09 的 comments/post_likes 表）


## 链 5：权限系统失效

P1-04 (前端未调用 permissionService)
  根因：P1-12 (权限判断基于可篡改的 user_metadata)
  根因：permissionService 已实现但无调用方
  影响：管理员无法在 UI 上看到管理按钮
  影响：后端 deletePost/updatePost 也只检查作者身份


## 链 6：XSS 全站漏洞

P0-01 (innerHTML 拼接用户数据)
  根因：缺少 escapeHtml 工具函数
  根因：utils/helpers.js 有 stripHtml 但用途不对
  影响：feed.js、my-posts.js、right-sidebar.js、header.js、sidebar.js、post.js 共 6 个文件

---

# 七、修复优先级建议

## 第一批（立即修复，解除阻塞）

1. P0-03：删除 SQL 中的 ALTER FUNCTION ... OWNER TO supabase_admin
2. P0-05：删除 20260711000009，统一 post_id 为 UUID
3. P0-06：为 20260711000006 增加 IF NOT EXISTS
4. P0-07：标注 20260711000005 为废弃
5. P0-08：改用 Dashboard 创建管理员
6. P0-04：执行迁移创建 profiles 等表
7. P0-02：改用 profiles 表查询用户信息
8. P1-07：删除 post.js 中 category_id 引用
9. P0-01：新增 escapeHtml 函数，修复所有 innerHTML 拼接
10. P0-11：修复 img src 空字符串
11. P0-12：定义 --md-sys-color-warning 变量
12. P0-13：字体本地化

## 第二批（尽快修复）

13. P1-12：权限判断依赖 RLS
14. P1-13：修复 catch 块变量作用域
15. P1-15：调整迁移执行顺序
16. P1-04：前端调用 permissionService
17. P1-03：帖子详情页渲染图片
18. P1-05：post.js 支持编辑模式
19. P1-19：修复密码强度指示器 CSS
20. P1-20：修复 form-textarea 重复定义
21. P1-21：修复 checkSession 未 throw

## 第三批（迭代优化）

22. P1-01 至 P1-24 中未在第一批和第二批的项
23. 所有 P2 级别问题
24. 所有 P3 级别问题

---

审计完毕。共发现 102 个问题，其中 13 个 P0 阻塞性问题需立即处理。最关键的问题链是：SQL 迁移问题（P0-03/05/06/07/08）阻塞数据库表创建（P0-04），进而阻塞用户信息显示修复（P0-02）和评论/点赞功能（P0-09）。建议按"修复 SQL -> 执行迁移 -> 修复 post.js -> 修复 XSS -> 修复其他"的顺序逐步解除阻塞。
