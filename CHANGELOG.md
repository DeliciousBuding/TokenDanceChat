# Changelog

## Unreleased (2026-05-23)

### Added
- AgentHub 验证项目定位文档与长期工程目标文档。
- 群组传入 Webhook 管理 UI：管理员可在群信息面板中创建、复制、列出、删除 Webhook。
- Webhook 集成文档，覆盖 WebSocket 控制事件、HTTP 投递格式、安全契约和验证命令。
- 前端 focused 测试覆盖 Webhook 一次性 secret 状态和群面板管理行为。

### Fixed
- `webhook_create` 现在会把 secret 只返回给创建者，避免创建后无法实际调用 HTTP Webhook。
- `webhook_list` 现在要求群主/管理员权限，并且列表响应不再暴露 secret。
- `store.Webhook.Secret` 加上 `json:"-"`，降低误序列化泄露风险。
- `useWebSocket` 的 `translate_result` / `webhook_*` 事件现在进入统一退订列表，避免重复订阅泄漏。
- `GroupInfoPanel` hooks 顺序整理到条件返回之前，避免群面板打开/关闭时的 hooks 数量变化风险。

### Changed
- `ROADMAP.md` 改为持续目标账本，明确本项目是 AgentHub 技术栈验证项目和可玩 Demo。
- 删除根目录交接文档，改由 `AGENTS.md` 承载项目级 Agent 接手规则、架构地图和验证命令。

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
