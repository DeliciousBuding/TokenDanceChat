# Changelog

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
- Delicious233 账号密码确认：`123456`，登录 API 验证通过。
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
