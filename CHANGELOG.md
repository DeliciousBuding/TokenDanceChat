# Changelog

> **累计**: 20+ commits, 30+ features/fixes, 5 skills (verify, pm-audit, deploy, cross-review, i18n-scan)

## v0.2.10 (2026-05-24)

### Added
- Register 保留用户名检测：`isReservedUsername` 导出供 handler 层使用，防止注册占用保留用户名。
- HealthCheck 方法强制实施：Docker HEALTHCHECK 探针 `/api/health` 遵循 `CHAT_ADDR`。
- hub method 测试 (+8)：hub 模块新增 8 个 focused 测试，覆盖注册/健康检查路径。

### Fixed
- E2E 修复：E2E 测试套件稳定性修复，对齐最新 UI 变更。

## v0.2.9 (2026-05-24)

### Added
- Poll 前端集成：创建/投票/结果展示 UI，WS handlers + store + MessageBubble 渲染，typed WebSocket event 前后端闭环。
- AdminPanel 完整 i18n：所有管理界面文案国际化，中英文覆盖。
- a11y i18n 补全：28 个无障碍翻译键，覆盖 ~20 个文件。
- i18n-scan skill：i18n 扫描、键值校验、未翻译检测 SOP（`.agents/skills/i18n-scan.md`），已执行并通过。
- E2E 测试套件扩展：auth、dm、group、poll、reconnect、sidebar、webhook 共 5+ 套。

### Changed
- 前端测试从 627 扩展至 679（+52 tests），后端测试新增 30+ tests（main 模块集成测试 + media 模块 focused 测试）。
- 性能优化：lastPreviews O(1) 查找、replyCounts 缓存、reaction/read_by O(1) Map 预索引。

### Fixed
- 滚动条无法拖动根本原因修复（第 4 次尝试终成功）：父级 wrapper 缺少 `flex flex-col`，导致 flex 子元素高度计算错误，滚动容器无法正确收缩。
- `window.__chatAPI` 仅 DEV 和 `?e2e` 模式下暴露，生产环境不挂载调试 API。
- `Hub.Stop()` goroutine 安全测试清理：修复测试中 hub 关闭时的数据竞争。
- `formatTime` / `formatLastSeen` 新增 `lang` 参数（i18n P3）：时间格式化现在根据当前语言环境返回本地化字符串。
- E2E scroll-ux 测试：8 个滚动行为测试，针对生产环境验证 scrollIntoView、回到底部 FAB、新消息自动滚动等行为。

## v0.2.8 (2026-05-23)

### Added
- WebSocket 自动重连（指数退避 + jitter：1s/2s/4s/8s/16s 上限），重连期间显示 banner 提示。
- 侧栏对话预览：最后一条消息摘要 + 相对时间戳（刚刚 / X 分钟前 / 日期 / 年份）。
- 未读「新消息」分隔线（蓝色强调线），标记上次离开后的新消息起点。
- 移动端语音消息按钮可见（不再隐藏在折叠菜单中）。
- 相对时间戳系统：刚刚、X 分钟前、今天 HH:mm、昨天 HH:mm、日期、年份。
- 侧栏 IA 重排：DM 和群组置顶，AI 助手分区折叠；侧栏新增对话搜索/过滤。
- 桌面端 header「更多」下拉菜单：语言切换、主题切换、导出记录、设置入口。
- 群组消息已读回执：「N 人已读」显示（群组内非本人的已读计数）。
- 在线用户排序优化：好友和 DM 联系人优先显示；在线用户区域加载骨架屏。
- 消息入场动画（fade-in + slide-up），新消息平滑进入视口。
- 回到底部 FAB（Telegram 风格，距离底部 200px 触发，ChevronDown 图标，带未读计数徽章，opacity+scale 过渡）。
- 消息送达状态指示器（Telegram 双勾风格）：已读蓝✓✓ / 已送达灰✓✓ / 已发送无勾。
- 发送失败反馈：WebSocket 断开时发送按钮红色闪烁 + 警告 toast。
- URL 预览卡片（紧凑型，500ms 防抖，年龄分级过滤，加载/错误/溢出状态覆盖）。
- 4 个项目级 Skills：verify、pm-audit、deploy、cross-review（位于 `.agents/skills/`）。
- GitHub Actions CI 工作流：backend-test、frontend-test、lint。
- ESLint flat config 迁移（零警告）。
- AGENTS.md 新增 dev-loop 工作流、模型分配策略、分支策略、安全边界 grep 自检规则。
- 前端 ErrorBoundary 包裹 `<App />`，防止未捕获异常导致空白页。
- Guest 身份警告提示（JoinScreen 游客模式免责说明）。
- 格式化工具栏可发现性改进（Markdown 工具按钮更明显）。
- JoinScreen 引导文案优化（注册/登录/游客三种路径说明）。

### Changed
- 前端测试从 237 扩展至 636（40 文件，~40% 行覆盖率）。
- E2E 测试从 18 扩展至 54（44 auth-flow + 8 group-call + 2 webhook ingress）。
- 后端测试大幅扩展：handler +34、hub +8、store +7、llm +8、ratelimit 更新、ws +2。
- WebSocket rate limit 从 30 提升至 50（每 10 秒），适应并行 E2E 测试和重连风暴。
- 桌面布局断点从 `md` 移至 `lg`，解决平板 textarea 挤压问题。
- 移动端消息密度收紧：更小气泡字号、更窄内边距、减少分隔线内边距。
- 移动端辅助操作收入更多菜单，确保「公共聊天」完整显示。
- 消息 hover 操作合并为单个 44px 操作菜单（copy / forward / translate / react / pin / edit / delete / select）。
- Header 操作、Markdown 工具栏、定时消息入口、侧栏工具按钮、可点击头像、消息操作按钮均提升至 44px 触摸目标。
- 核心聊天界面视觉减重：气泡边框更轻、composer 工具按钮不再渲染粗边框块。
- light mode 设为首次运行默认主题（飞书风格验收）。
- 移动端 composer 重做：Markdown 工具收起为图标，textarea 保持完整可用。
- 项目 Skills 从 `.claude/skills/` 迁移至 `.agents/skills/`。
- ROADMAP.md、product-gap-analysis.md、AGENTS.md 随进度同步更新。

### Fixed
- **多轮交叉审查修复（5 轮）**：
  - Round 1 (HIGH): register channel buffer 数据竞争、admin stats rate limit 遗漏。
  - Round 1 (MEDIUM): 无界内存 map 清理、CORS/WS 硬编码域名移除。
  - Round 2 (HIGH): scrollIntoView 级联导致 ChatInput 被推出视口；`min-h-0` 缺失导致 MessageTranscript flex 容器无法收缩。
  - Round 2 (MEDIUM): ForwardModal CSS 脆弱性、PollMessage error path、ThreadPanel onSendReply、MessageTranscript i18n masking。
  - Round 3: Sidebar previewMap 记忆化缺失、i18n key 冲突、未读清理不完整、屏蔽用户过滤不一致、年份消除歧义、localStorage user-scoped 隔离。
  - Round 4: 组件 handlers 生命周期问题、媒体错误路径加固。
  - Round 5: 3 项 MEDIUM 跨组件问题 + hub 测试补充。
- 3 项安全修复：邀请码枚举泄露、WritePump 挂起导致 goroutine 泄漏、密码 bcrypt 长度上限。
- LoginScreen 错误 i18n 映射（auth.loginFailed / auth.registerFailed）。
- RegisterScreen i18n 修复（auth.fillAllFields）。
- Settings 按钮标签修复（notificationPrefs → openSettings）。
- product-gap-analysis.md 陈旧条目修正（置顶/归档/静音/编辑状态同步）。
- `isGuest=false` 防御性重置：每次 `connect()` 调用强制重置游客标志。
- 生产构建静态资源被计入 REST API rate limit 的问题：`/api/...` 保持限流，SPA 静态资源不限。
- 前端 `group_info` 处理修复：正确读取后端 `group_members` role payload，owner/admin 状态在 WebSocket round trip 后正确驱动群组信息和 Webhook 管理。

## v0.2.7 (2026-05-23)

### Added
- 会话挤下线机制：同名用户在新标签页登录时，旧连接自动断开并收到 "kicked" 消息，新会话正常接入。
- `/api/login` 和 `/api/register` 新增独立的 auth rate limiter（5 次/分钟/IP），防暴力破解。
- LoginScreen / RegisterScreen 添加 `autocomplete` 属性（`username`、`current-password`、`new-password`），适配密码管理器。
- RegisterScreen 新增表单完整性提示：「请填写所有字段后点击注册」。

### Fixed
- 注册成功后表单冻结问题：`handleAuthSuccess` 现在先切换到游客视图再执行自动加入，确保注册成功后正确跳转。
- WebSocket rate limit 从 5 提升至 30（每 10 秒），解决 14 worker 并行 E2E 测试被限流的问题。
- 前端 `handleJoinSuccess` 简化错误处理：挤下线机制消除 "already taken" 错误，普通错误直接显示服务端消息。
- 移除 `handleJoin` 中的 `IsUsernameTaken` 预检查——重复用户名由 hub 注册通道统一原子处理。

### Changed
- 挤下线机制取代旧的重复用户名拒绝策略：hub 注册通道在检测到同名用户时发送 "kicked" 消息并关闭旧连接，新连接直接接入。
- E2E 测试更新：`重复用户名被拒绝` → `重复用户名踢出旧连接`，验证新行为而非旧的错误提示。

## v0.2.6 (2026-05-23)

### Added
- 用户注册/登录流程修复：注册按钮无响应（字段未填无提示）、注册成功跳转冻结、登录后重复连接提示不友好。
- 前后端全面测试覆盖：237 前端单元测试 + 后端全量测试 + 18/18 E2E 线上实测。

### Fixed
- **CRITICAL**: `GetPinnedMessages` SQL 列数不匹配（SELECT 10 列但 Scan 11 列，缺少 `thread_id`）。
- **CRITICAL**: 6 个 WebSocket handler 未接入 ReadPump switch：`profile_update`、`profile_get`、`status_update`、`poll_create`、`poll_vote`、`poll_close`。
- **CRITICAL**: PicoClaw 路径使用 `context.Background()`（无超时，goroutine 泄漏风险），已替换为 60s `context.WithTimeout`。
- PDF iframe sandbox 安全加固：移除 `allow-same-origin`，防止 sandbox 逃逸。
- 重复 `ConversationSearch` 渲染：ChatLayout 中同一组件被渲染两次。
- 前端构建脚本：移除 `tsc -b`（在 CI 中解析模块失败），类型检查改为独立的 `npx tsc --noEmit`。
- `blog/go.mod` 无效 Go 版本 `go 1.25.0` 修正为 `go 1.24.0`。

### Changed
- 密码哈希从 SHA-256 升级为 bcrypt（cost 12）；`VerifyUser` 在登录成功时自动将旧 SHA-256 哈希升级为 bcrypt。
- CORS 从通配符 `*` 改为 origin-aware 逻辑：同源请求允许（无 Origin 头），跨域回显具体 origin，不允许的 origin 不返回 `Access-Control-Allow-Origin` 头。
- 前端 `index.html` 新增 CSP meta 标签：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; ...`。
- WebSocket connect 超时从 8s 提升至 15s。
- `.env.example` 更新 LLM 配置为 DeepSeek V4 Pro/Flash（无真实 URL 或 key）。
- PicoClaw system prompt 更新为飞书风格；删除死代码 `picoStreamDelta`、`BroadcastStreamChunk`、已废弃的 `picoclaw/bot.go`。
- 新数据库时自动 seed 4 条 TokenBot 欢迎消息（可通过 `CHAT_SKIP_SEED=true` 跳过）。
- `.gitignore` 新增 `backend/backend.exe`、`frontend/test-results/`。

## v0.2.5 (2026-05-23)

### Added
- 18 个 Playwright E2E 测试（5 workers），覆盖：页面加载、i18n 切换、加入表单验证、游客加入、消息发送、Webhook ingress。
- `scripts/verify.ps1` 新增 `-WithE2E` 参数：自动启动后端、运行 E2E、清理残留。
- MessageBubble、AdminPanel、ChatInput、GroupInfoPanel 组件测试。
- 前端 store 测试：webhook rotation、group call、chatStore 完整覆盖。
- 前端 `ErrorBoundary` 包裹 `<App />`，防止空白页面崩溃。

### Fixed
- E2E 选择器与生产 UI 不一致（旧 "加入聊天" 按钮 vs 新 "游客加入/登录/注册" 三按钮流程）。
- npm ci 损坏 node_modules：改用 `rm -rf node_modules && npm install`。

## v0.4.0 (2026-05-22)

### Added
- Assistant registry（集中化模型/助手配置）
- LobeHub 厂商图标（DeepSeek、Qwen、Kimi、GLM、MiniMax）
- ModelSelector 组件
- 消息复制到剪贴板（长按/右键菜单）
- Agent DM 入口（可私聊 Bot/Agent）
- 机器人流式响应卡片去重

### Fixed
- React error #321（useRef 在 useEffect 内调用，违反 Hooks 规则）
- 机器人回复出现两个卡片
- 快速双击导致消息重复发送
- 构建配置移除不必要的 React alias

### Changed
- Sidebar 增加 Assistants 和 Models 分区
- ChatInput @mention 补全从 registry 读取
- 前端部署文档整理，移除敏感信息

## v0.3.0 (2026-05-21)

### Added
- 前端 90 个测试（7 文件）：App、ErrorBoundary、JoinScreen、ConfirmDialog、I18nContext、utils、chatStore
- 后端测试扩展：Ping、IsBlocked、SearchMessages、ratelimit、DroppedMessages、Shutdown
- SHA-256 资源完整性 hash 生成脚本

### Fixed
- ErrorBoundary class 组件与 React 19 StrictMode 兼容
- ConfirmDialog 死代码（在 return 后定义）
- LinkPreview useEffect 缺少清理
- 长按计时器清理
- WebSocket 重连竞态
- FTS5 注入防护（sanitizeFTS5Query）
- PicoClaw 竞态（ResponseHandler closed atomic）
- LLM SSE 流 buffer 扩容至 1MB

## v0.2.0 (2026-05-20)

### Added
- Phase 2-6 功能完整实现
- 私信 (DM) · 群组 · 多房间
- Bot Agent（TokenBot + PicoClaw）
- 消息编辑 · 删除 · 转发 · 引用
- 表情反应 · 消息搜索 (FTS5)
- 图片上传/粘贴（WebDAV 存储）
- PWA Service Worker
- 中英文 i18n（50+ 翻译键）
- 桌面通知 · 音效
- 暗色/亮色/系统主题
- 移动端触屏适配

### Fixed
- 6 个 P0 安全修复（XSS、SSRF、路径穿越、FTS5 注入）
- 14 个 P1 可靠性修复（竞态、goroutine 泄漏、连接限制）

## v0.1.0 (2026-05-19)

### Initial Release
- 公共聊天室 + WebSocket 实时消息
- 昵称加入（无需注册）
- 在线用户列表 · 消息历史分页
- Markdown 渲染 · 暗色主题
- SQLite 持久化 · 频率限制
- Docker + Nginx 部署
