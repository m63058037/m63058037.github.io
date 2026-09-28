# 敏感词系统 · 数据库最终兜底 Migration 设计与验收报告

版本：v1.0
日期：2026-08-29
范围：DB Final Enforcement（最终兜底层）。前端检测 / Service 层 / UI 已验收并冻结，本阶段不改动已验收部分。
状态：设计 + 静态检查完成，Migration 未执行，等待人工验收。

---

## 0. 结论摘要

本阶段产出 1 个 Migration 文件（未执行）与 1 份验收报告。核心设计：让数据库成为敏感词系统真正的最终安全边界。即使绕过前端与 Service、直接用 Supabase ANON key 写库，也会被 BEFORE 触发器拦截拒绝；L3/L4 命中由安全 RPC 独立记录；敏感词管理仅 dev_admin 可通过函数内二次校验的 RPC 访问。静态检查已修复 1 处与既有 schema 不兼容的问题（L4 通知触发器的 admin_notifications 落库列），其余全部通过。

按约束：本阶段未执行任何 SQL、未连接 Supabase、未 Git 操作、未同步服务器、未启动任何浏览器测试。

---

## 1. 新增文件清单

1. 开发文件夹/docs/sql/20260829000000_sensitive_words_db_enforcement.sql —— 数据库兜底层 Migration（本阶段核心产物，仅待部署，未执行）。
2. 开发文件夹/docs/敏感词系统_DB最终兜底Migration设计与验收报告.md —— 本报告。

前序依赖 Migration（必须已执行）：20260820000000、20260820000002、20260826000000。M igration 文件头已声明该前置条件。

---

## 2. Migration 创建的对象

新增表（3 张，全部启用 RLS）：

1. sensitive_words —— 敏感词词典表。中文/英文/数字同一张表，词条数据化，后续增词不修改业务代码。字段：id、word、lang、level、rule_type、pattern_hint、is_active、hit_count、created_by、created_at、updated_at；(word, lang) 唯一。
2. sensitive_word_hits —— L3/L4 命中记录表。字段：id、user_id、user_name、level、matched_word、rule_type、content_type、target_id、field_name、content_summary、is_repeat、handle_status、handler_id、handled_at、created_at。
3. sensitive_word_config —— L4 配置驱动表：l4_repeat_window_days(7)、l4_repeat_count(3)、l4_action(ban)。阈值不硬编码。

新增复合类型：public.sv_hit(level, matched_word, rule_type)。

新增函数（21 个）：

检测与归一化（内部，REVOKE PUBLIC，不对外授权）：
- sv_analyze(text) —— 归一化：全角→半角、大写→小写、去除零宽/不可见字符、连续分隔折叠为单空格，产出双视图（a=保留单空格分隔 供边界匹配；c=纯字符 供子串匹配）。
- sv_has_indep(text,text) —— char_indep 独立字边界匹配。
- sv_has_digit(text,text) —— digit 独立数字边界匹配（前后不得紧邻数字）。
- sv_has_english(text,text) —— english 英文分隔（0..1 空格）与字母序列匹配。
- sv_check_text(text) —— 唯一检测入口，返回最高命中等级（含命中词与规则）。

业务表兜底触发器函数（5 个，SECURITY DEFINER）：
- sv_reject_posts / sv_reject_comments / sv_reject_profiles / sv_reject_reports / sv_reject_announcements。

命中记录与通知：
- log_sensitive_hit —— 前端/Service 在 L3/L4 拒绝写入前调用，独立事务记录命中；命中词/等级由 sv_check_text 重算，不可伪造。
- sv_notify_admin_on_l4 —— AFTER INSERT 触发器，L4 命中自动生成 dev_admin 管理员待办通知。
- sv_config(text) —— 读取 L4 配置（内部）。

管理 RPC（仅 dev_admin，函数内二次校验）：
- admin_sensitive_words_get —— 列表/检索（含停用词，分页）。
- admin_sensitive_word_add —— 新增词条。
- admin_sensitive_word_update —— 修改词条。
- admin_sensitive_word_set_active —— 停用/启用（软删）。
- admin_sensitive_word_delete —— 硬删除。
- admin_sensitive_hits_get —— 查看 L3/L4 命中记录（分页、按等级/状态过滤）。
- admin_sensitive_handle_hit —— 命中处置（resolved/ignored/ban，仅 L4 允许封禁）。

客户端词典端点：get_active_sensitive_words —— 返回活跃词条的 word/lang/level/rule_type/pattern_hint（供前端/Service 预检），匿名可读。

新增索引（6 个）：词典 active 索引、hits 表 level/user/status 三个索引、（词典由模型自带主键索引）。

新增触发器（7 个）：
- trg_posts_sensitive_reject（posts BEFORE INSERT OR UPDATE）
- trg_comments_sensitive_reject（comments BEFORE INSERT OR UPDATE）
- trg_profiles_sensitive_reject（profiles BEFORE INSERT OR UPDATE）
- trg_reports_sensitive_reject（reports BEFORE INSERT OR UPDATE）
- trg_announcements_sensitive_reject（announcements BEFORE INSERT OR UPDATE）
- trg_sensitive_word_hits_updated_at（hits BEFORE UPDATE，维护 updated_at）
- trg_sensitive_word_hits_notify_admin（hits AFTER INSERT WHEN level>=4）

种子数据：sensitive_words 初始词典 62 条，严格取自《敏感词.txt》v1.0，与 services/sensitive-word.js 的 INITIAL_DICTIONARY 逐字比对一致（word/lang/level/rule_type 全部相同，无增删改）。sensitive_word_config 3 条默认值。

---

## 3. 每个 RLS 的权限范围

总原则：RLS 打开 + 不创建任何 anon/authenticated 策略。PostgREST 下普通用户和普通管理员对这种表无法 SELECT/INSERT/UPDATE/DELETE（无策略即无任何行可见/可写，不受历史 GRANT 影响，因 RLS 优先于表级授权判定）。表 owner（postgres）与 SECURITY DEFINER 函数（owner 上下文）可访问——全库未使用 FORCE ROW LEVEL SECURITY，已核验。

1. sensitive_words：RLS ENABLE，零策略。普通用户、普通管理员禁止直读/直改词典表（含管理字段）；不得把词典作为 oracle 直接查询。
2. sensitive_word_hits：RLS ENABLE，零策略。普通用户禁止读取违规日志；任何角色禁止直写（只能经 log_sensitive_hit）。
3. sensitive_word_config：RLS ENABLE，零策略。配置仅函数内部可读（sv_config）。
4. 既有业务表（posts/comments/profiles/reports/announcements）：本 Migration 不触碰其 RLS，仅追加触发器，未放宽任何既有权限。已核验无 FORCE RLS、无新增放行策略，故不存在 RLS 回归。

---

## 4. 每个 RPC 的权限范围

统一采用：SECURITY DEFINER + SET search_path=public + 函数内部用 get_user_role(auth.uid()) 二次校验角色 + REVOKE PUBLIC EXECUTE + 仅 GRANT 必要角色。不依赖前端隐藏菜单。

1. get_active_sensitive_words：REVOKE PUBLIC；GRANT anon, authenticated。仅返回 word/lang/level/rule_type/pattern_hint（不含 hit_count/created_by/updated_at 等管理字段）。供前端/Service 读取活跃词典做预检，与前端已内置镜像一致。
2. log_sensitive_hit：REVOKE PUBLIC；GRANT authenticated。任何已登录用户可调用，但身份以 auth.uid() 为准不可伪造，命中词/等级由 sv_check_text 重算不可伪造，仅 L3/L4 落库；guest 拒绝。
3. admin_sensitive_words_get / add / update / set_active / delete：REVOKE PUBLIC；GRANT authenticated + 函数内强制 role='dev_admin'，否则 RAISE 42501。
4. admin_sensitive_hits_get：REVOKE PUBLIC；GRANT authenticated + 函数内强制 dev_admin。
5. admin_sensitive_handle_hit：REVOKE PUBLIC；GRANT authenticated + 函数内强制 dev_admin；仅对 L4 允许 ban 处置。
6. 内部函数 sv_analyze / sv_has_indep / sv_has_digit / sv_has_english / sv_check_text / sv_config / sv_reject_* / sv_notify_admin_on_l4：全部 REVOKE PUBLIC，无授权给 anon/authenticated。物理杜绝把检测引擎/词库 oracle 暴露给 API。

管理员能力矩阵（按角色）：
- dev_admin：可管理词典、查看/处置 L3/L4 命中、可 ban（L4）。但发布业务内容仍受业务表触发器约束，无法写入敏感内容。
- admin（普通管理员）：不满足 dev_admin，无法调用任何管理 RPC，无法读取词典表/hits 表。
- 普通用户 / guest：无词典与违规数据访问权；guest 连 log_sensitive_hit 也被拒绝。

---

## 5. 哪些业务表增加了最终检测（数据库权威兜底）

BEFORE INSERT OR UPDATE 触发器，任一命中（level>=1）即整条语句回滚拒绝。覆盖字段如下：

- posts：title、content
- comments：content（评论与回复/子评论同表，一条触发器同时覆盖两者）
- profiles：nickname（用户名称）、signature（个性签名）、bio（简介）
- reports：content（举报说明，可空）
- announcements：title、content（管理员公告）

说明：触发器为 SECURITY DEFINER（owner 上下文），因此能读取词典；且对经管理 RPC 的写入同样生效，dev_admin 也无法绕过业务内容检测。

---

## 6. L3/L4 如何记录

设计要点：PostgreSQL 事务原子性下，被拒绝的写入会一并回滚。因此「拒绝写入」由 BEFORE 触发器保证必然生效；「L3/L4 命中记录」不能寄生在同一回滚事务里，而由独立 RPC log_sensitive_hit 完成——应用/Service 层在检测到 L3/L4 且拒绝写入之前调用，独立提交，不受被拒语句回滚影响。

规则：
- L1/L2：BEFORE 触发器拦截拒绝，但不记录。
- L3/L4：同样被拦截拒绝，同时若应用层已先调用 log_sensitive_hit 则落库记录。
- 记录内容：user_id(auth.uid()，不可伪)、user_name(profile 快照)、level、matched_word、rule_type（均由 sv_check_text 重算）、content_type、target_id、field_name、content_summary(截断前 300 字)、is_repeat、handle_status='pending'。
- is_repeat 判定：仅对 L4 计算，依据 sensitive_word_config 的窗口天数/阈值（当前 7 天、3 次），读取自身 user_id 窗口内 L4 计数得出。阈值配置驱动，不硬编码。
- 命中后同时递增 sensitive_words.hit_count。

安全属性：普通用户无法直写/直读 hits 表（RLS 零策略）；命中词与等级由函数重算，无法伪造；日志只能针对调用者自己（auth.uid()）。

---

## 7. L4 如何进入管理员处理流程

- 流程：log_sensitive_hit 落库 hits 记录（handle_status='pending'）→ AFTER INSERT 触发器 sv_notify_admin_on_l4（WHEN level>=4）自动写入 admin_notifications（notification_type='system'，target_type='sensitive_word_hit'，target_id=命中记录 id，title/content 给出规则与用户提示）→ dev_admin 通过 admin_sensitive_hits_get 查看 → 通过 admin_sensitive_handle_hit 处置（resolved / ignored / ban）。

- L4 封禁：admin_sensitive_handle_hit 仅在动作='ban' 且命中为 L4 时，将 profiles.account_status 置为 'banned'。这是既有账号状态枚举的合法取值；get_user_role 对非 active 账号返回 'guest'，该账号随后的管理员/成员特权即时被既有 RLS 与权限判定收回，不破坏 account_status/RLS 体系（与既有封禁一致做法）。处置后 hits 记录 handle_status 更新并由 handler_id/handled_at 审计。

- 配置驱动：l4_repeat_window_days / l4_repeat_count 已被读取用于 is_repeat；l4_action(默认 ban) 已在表中建模，但为避免破坏既有账号体系，未做硬编码的自动封禁，自动处理收敛为「生成管理员待办」+「仅 dev_admin 可执行的处置/封禁」。若日后需要更强的自动化，只需在配置或一处流程中调整，不动多处理逻辑。此为评估后有意为之的保守设计，非缺漏。

---

## 8. ANON 直写绕过测试如何验证（本阶段仅设计，不执行）

目标：证明即使绕过前端与 Service，用 Supabase ANON key 直接写库也无法写入敏感内容。

设计三类测试，全部为「预期拒绝，实际写库」验证，本阶段不执行：

A. 内容敏感词兜底（模拟绕过）—— 分别对以下表执行 INSERT / UPDATE 含敏感词内容（覆盖《敏感词.txt》代表性词条与变体：中文组合、英文分隔、全角、零宽、数字独立边界）：
- posts：title 与 content 含敏感词 → 期望 RAISE SENSITIVE_CONTENT，行不落库。
- comments：content 含敏感词（含回复场景）→ 期望拒绝。
- profiles：nickname / signature / bio 含敏感词 → 期望拒绝。
- reports：content 含敏感词 → 期望拒绝。
- announcements：title / content 含敏感词 → 期望拒绝。
- 正常内容（含「死」「妈」单字、长数字含 91/78、白名单字段）→ 期望正常写入，验证无误伤。

B. 角色权限测试：
- 普通用户（member）：调用 admin_sensitive_words_get / add / update / set_active / delete、admin_sensitive_hits_get / handle_hit → 期望 42501 permission denied；直接 SELECT sensitive_words / sensitive_word_hits → 期望 0 行 / 拒绝。
- 普通管理员（admin）：上述管理 RPC → 期望同样 42501；词典表直读 → 拒绝。验证「普通管理员不能调用敏感词管理 RPC」。
- dev_admin：上述管理 RPC → 期望成功；admin_sensitive_handle_hit 对 L4 执行 ban → 成功且账号置 banned；get_user_role 随后返回 guest。
- dev_admin 发布敏感内容（posts/announcements 等）→ 期望同样被触发器拒绝，验证「dev_admin 也不能绕过内容敏感词检测」。

C. L3/L4 记录验证：
- 触发 L3 命中且先调用 log_sensitive_hit → 期望 hits 落库 level=3、handle_status=pending，但业务写入仍被拒。
- 触发 L4 并重复至窗口阈值 → 期望 is_repeat=TRUE，且 admin_notifications 生成 1 条 L4 待办。
- 普通用户直写 hits 表 → 期望拒绝。
- anon（未登录）调用 log_sensitive_hit → 期望被拒（仅 authenticated）。

建议执行方式：Supabase SQL Editor / 本地 psql 以对应 JWT 角色模拟，或按既有一键测试脚本风格编写待 SQL 上库后再跑的只读验证 SQL（不含外围数据写入为副作用）。本阶段不运行。

---

## 9. 106 条 TC 哪些对应数据库层

本阶段聚焦规则一致性（检测函数复刻已在阶段 0/检测引擎验收的三层一致语义）。数据库层强相关的 TC 类别（编号以阶段 0 实际为准，此处按类别归类，均在函数逻辑与种子词典上静态核对通过）：

1. 中文敏感词类：操/妈的/傻逼 等 contains 与 char_indep 独立字（如「操」需边界；「操作」「牛逼」不误伤）——sv_check_text + sv_has_indep。
2. 组合词类：「死妈」「死 妈」「死-妈」「死。妈」均命中；「死」「妈」单独出现放行；「死阿姨」等非连续不命中——combo 用 c 视图子串匹配，分隔符在归一化中被去除。
3. 英文敏感词类：fuck / f u c k / F-U-C-K / 全角 ＦＵＣＫ 命中；f中国uck 不命中——sv_has_english。
4. 数字边界类：91/78 独立数字命中；长数字内嵌 91/78 不误伤——sv_has_digit 前后数字边界判定。
5. 归一化类：全角→半角、大写→小写、零宽/不可见字符剔除——sv_analyze。
6. 等级类：多个敏感词并存取最高级（ORDER BY level DESC 首个命中）；L1/L2 拦截不记录；L3/L4 拦截并记录——sv_check_text + log_sensitive_hit 的 level>=3 落库门槛。
7. 白名单/误伤类：正常内容、边界误伤防护——触发器对 level=0 直接放行。

已完成的对齐验证：种子词典 62 条与前端检测引擎字典逐条一致（word/lang/level/rule_type）；四类匹配函数按 TC 语义在 plpgsql 中静态推演复核。数据库层不新增、不删除、不降/提等级、不扩大模糊匹配。

---

## 10. 静态检查结果

已执行（未连接数据库，纯静态核对）：
1. SQL 结构：44 个 dollar-quote 完全成对；21 个函数 BEGIN/END 配对；7 个触发器；9 个 GRANT 与 21 个 REVOKE 与函数清单一致。
2. RLS 逻辑：3 张新表 RLS ENABLE 且零 anon/authenticated 策略；全库无 FORCE RLS；既有业务表 RLS 未改。
3. SECURITY DEFINER：所有 SECURITY DEFINER 函数均 SET search_path=public；管理 RPC 函数内用 get_user_role(auth.uid()) 二次校验 dev_admin。
4. RPC 权限：全部分层 REVOKE/GRANT 正确；内部函数未授权给 anon/authenticated。
5. 触发器逻辑：拒绝型 BEFORE + 记录/通知型 AFTER 与事务原子性说明一致；hits 表 updated 触发器复用既有 update_updated_at_column()。
6. 兼容性：核验了被引用的既有对象真实存在——get_user_role(20260826000000 已重构为对 banned 返回 guest)、update_updated_at_column(20260819000000)、admin_notifications(20260820000002，列 notification_type/title/content/target_type/target_id)、profiles(nickname/signature/bio/account_status，id=UUID)、posts(id/user_id=VARCHAR，title/content)、comments(content + parent_comment_id，同时覆盖评论与回复)、reports(content)、announcements(title/content)。posts.id 保持 VARCHAR 未触碰。
7. 与本 Migration 列类型一致性：sensitive_word_hits.user_id 为 TEXT 兼容 posts.user_id(VARCHAR) 与 comments.user_id(UUID)；target_id TEXT；ban 时 user_id::uuid 回写 UUID 型 profiles.id，命中记录一律由 UUID::text 生成故可安全反解。

发现并已修复 1 处问题：
- 原 sv_notify_admin_on_l4 触发器误用了不存在的列（recipient_role、is_read）。已改为既有 admin_notifications 的标准落库列（notification_type/title/content/target_type/target_id），并复刻既有 report 通知触发器的写法。修复后触发器与真实 schema 兼容。
（修复前该触发器执行必然报错，属必须修复项；修复后 21 个函数/7 个触发器全部通过静态核验。）

---

## 11. 潜在 RLS 回归排查

- 既有表 RLS：无改动、无新增放行策略、无 FORCE RLS → 无回归。
- 新表 RLS：默认拒绝一切 anon/authenticated 直访问 → 权限正确方向（收紧而非放宽）。
- 无任何语句对既有表执行 GRANT/REVOKE 或 ALTER TABLE ... ENABLE/DISABLE RLS → 不改变既有权限面。
- 触发器叠加不改变既有增删改权限判定，仅在内容命中时额外回滚。
- 结论：未发现 RLS 回归与权限降级。

---

## 12. 与现有项目架构冲突检查

- posts.id 保持 VARCHAR，未做任何类型改动 → 与「不得修改 posts.id」一致。
- 未引入 service_role；管理权限全部在数据库函数内部校验 → 继续遵循「只使用 Supabase ANON key」架构。
- 未要求前端持有管理员密钥；管理动作全部收敛到由角色二次校验的 RPC → 前端仅需登录态，不泄露密钥。
- 词典数据化，增词走 data 而非业务代码 → 与「服务与前端字典同源、可后续增词」一致。
- L4 封禁尊重既有 account_status 枚举与 get_user_role 的 banned→guest 收敛 → 不破坏账号/RLS 体系。
- 唯一需功能性注意点（非冲突，属既定协商）：get_active_sensitive_words 对 anon 开放，会暴露「活跃词典词表」本身。这与现有前端已随包分发词典镜像的事实一致，属预期行为；管理字段（hit_count/created_by 等）与违规日志仍完全封闭，且未提供检测 oracle（sv_check_text 不对外授权）。
- 未发现与既有列名、函数名、对象名冲突（新增对象命名均带 sv_/sensitive_ 前缀，get_active_sensitive_words 全库唯一）。

---

## 13. 遗留事项与验收建议

待人工验收项：
1. 请人工审阅 Migration 中「敏感词管理 RPC 授权仅到 authenticated + 函数内校验」的做法是否符合预期（当前为最保守口径：普通管理员也无法调用）。
2. 请确认 L4 自动动作为「仅通知 + dev_admin 处置」，不再自动封禁，符合预期。
3. 人工验收通过后，方可执行 Migration（用户明示「Migration 没问题，可以执行」后方进入下一步）。

本阶段未执行任何 SQL、Migration、Git、服务器同步、发布或浏览器测试。等待人工验收。