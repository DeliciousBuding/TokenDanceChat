# TokenDanceChat ROADMAP

最后更新：2026-05-23（晚）

发布: [v0.2.7](https://github.com/TokenDanceLab/TokenDanceChat/releases/tag/v0.2.7) | Docker: `tokendancechat:v0.2.7` | 测试: 624 前端 / 40 文件 / 全绿

## 当前目标

TokenDanceChat 是 AgentHub Hub/IM 验证项目兼可玩 Demo。

长期产品目标是验证 AgentHub 的 realtime Hub、SQLite 持久化、React 客户端状态、Agent-as-contact UX 和部署形态，同时将 Demo 向以下方向演进：

- 飞书/Lark 风格的 1:1 聊天功能对等度，面向企业协作；
- Telegram 级别的消息流动、对话人体工学、移动端交互质量；
- 安全、可测试、可部署的工程基线，能将经验回流到 `D:\Code\AgentHub`。

`ROADMAP.md` 是面向未来 agent 的持久化目标账本。每次有意义的实现、验证、安全复核或范围决策后更新。

## 产品原则

1. **AgentHub first**
   TokenDanceChat 验证 AgentHub 的 IM 协作和 Hub 网络层。不得演化为独立的长期产品架构。

2. **可玩 Demo**
   应用应保持可用和有趣：DM、群组、通话、emoji、GIF、文件、文件夹、翻译、webhook 和 Agent 聊天都很重要，因为它们对平台施加真实压力。

3. **Typed realtime protocol**
   新能力应使用显式 WebSocket message type、typed 前端 helper、store contract 和 focused tests。

4. **Security by default**
   Secret 应为一次性或在可行时脱敏；仅生产环境细节不进入公开文档；安全发现追踪于 `SECURITY.md` 和本 roadmap。

5. **Verified increments**
   每次代码变更需先过 focused check，再 broader verification，方可声称完成。

## 活跃工作流

| 优先级 | 工作流 | 目标 |
|---|---|---|
| P0 | AgentHub 验证对齐 | 保持 README、docs、roadmap、protocol 和 store contract 映射到 AgentHub 原语。 |
| P0 | 协议/存储加固 | 将 WebSocket event 和 SQLite 表视为可复用 Hub 证据；为安全敏感合约添加回归测试。 |
| P0 | 验证基线 | 保持 `go test ./...`、前端 focused tests、`npx tsc --noEmit`、`git diff --check` 全绿。 |
| P1 | 飞书对等 | 群组管理、webhook、文件、threads、reactions、通知、搜索、通话、管理界面、企业协作流。 |
| P1 | Telegram UX | 快速消息列表、干净输入、移动端手势、copy/reply/edit 人体工学、打磨过渡、媒体查看器质量。 |
| P1 | Agent-as-contact | 让 TokenBot/PicoClaw 感觉像 IM 联系人：DM、群组 mention、流式回复、模型/provider 可供性、工作流转移。 |
| P2 | 运维/性能 | Health check、部署 checklist、bundle/runtime profiling、虚拟列表调优、WebSocket fanout/load check。 |
| P2 | UI/美术方向 | 克制企业 UI + 流畅聊天交互；避免装饰性营销布局。 |

## 当前增量（dev）：测试覆盖 + 工程基建 + UX 打磨

状态：持续推进。624 tests / 40 files / tsc 0 / ESLint 0 / CI 就绪。

- [x] 前端测试从 237 → 624 (+387 tests / +22 文件 / 40%+ 行覆盖率)。
- [x] E2E 测试从 18 → 54 (44 auth-flow + 8 group-call + 2 webhook)。
- [x] 后端测试扩展：store +7、hub +8、handler +34、llm +8、ratelimit 更新、ws +2。
- [x] PM 产品审计 P0 修复：侧栏对话预览、未读「新消息」分隔线、移动端语音按钮可见。
- [x] PM 产品审计 P1 修复：侧栏 IA 重排（DM/群组优先，AI 助手折叠）、对话搜索/过滤。
- [x] PM 产品审计 P2 修复：桌面 header「更多」下拉菜单、相对时间戳（刚刚/X分钟前/日期/年）。
- [x] 交叉审查 HIGH/MEDIUM 全部修复（ForwardModal CSS 脆弱性、PollMessage error paths、ThreadPanel onSendReply、MessageTranscript i18n masking）。
- [x] ScrollToBottom FAB（Telegram 风格，200px 阈值，ChevronDown 图标，opacity+scale 动画）。
- [x] LoginScreen 错误 i18n 映射（auth.loginFailed / auth.registerFailed）。
- [x] RegisterScreen i18n 修复（auth.fillAllFields）。
- [x] Settings 按钮标签修复（notificationPrefs → openSettings）。
- [x] product-gap-analysis.md 陈旧条目修正（置顶/归档/静音/↑编辑）。
- [x] 3 项安全修复（邀请码枚举泄露、WritePump 挂起、密码 bcrypt 上限）。
- [x] CI/CD: GitHub Actions（backend-test / frontend-test / lint）。
- [x] 项目 Skills: `.agents/skills/verify.md`、`.agents/skills/pm-audit.md`。
- [x] api.ts 测试（142 tests，覆盖 send 方法、事件调度、ErrorCode、disconnect）。
- [x] 消息送达状态（Telegram 双勾风格：已读蓝✓✓ / 已送达灰✓✓ / 已发送无勾）。
- [x] AGENTS.md 新增 dev-loop 工作流、模型分配策略、分支策略。
- [x] 安全泄露 3 条 grep 自检 + 违规响应协议。
- [x] 覆盖率达 40%+（40.47% 行覆盖率）。
- [x] Opus 审查 MEDIUM/LOW 修复：无界内存 map 清理、CORS/WS 硬编码域名移除。
- [x] Opus 交叉审查第二轮修复（2 HIGH + 5 MEDIUM）：Sidebar previewMap 记忆化、i18n key 冲突、未读清理、屏蔽用户过滤、年份消除歧义、user-scoped localStorage。
- [x] 群组视频通话 E2E（8 tests，含 signaling flow、UI 状态管理、多标签隔离）。

## 当前增量：Webhook 安全 + 媒体存储 + Screenshot 驱动 UI 验收

状态：已实现、已文档化、已测试、已通过浏览器 screenshot 验收。

- [x] 将明文 webhook secret 持久化替换为 SQLite 中 versioned salted HMAC hash。
- [x] 添加 store 启动迁移以处理旧版明文 webhook secret 行。
- [x] 添加 `store.VerifyWebhookSecret`，将 HTTP webhook ingress 路由通过 constant-time hash 验证。
- [x] 将生成的一次性 webhook secret 强化到超出短 UUID 片段的熵值。
- [x] 为 hashed webhook 持久化、迁移、脱敏、权限检查和 HTTP ingress 添加 focused store、hub、handler 测试。
- [x] 添加 S3-compatible `MediaStore` 支持，含 AWS SigV4 签名和 env 驱动配置。
- [x] 将 S3 置于同源 `/uploads/...` 路由之后，前端状态永不见 bucket URL 或凭证。
- [x] 将自定义 emoji 上传/服务路径迁移到共享 `MediaStore` 抽象。
- [x] 加固 media key 以拒绝空段、`.`、`..` 和路径穿越，覆盖 local/WebDAV/S3 访问。
- [x] 为 S3 PUT/GET、emoji 媒体存储、emoji 服务和穿越拒绝添加 focused 后端测试。
- [x] 记录 S3-compatible 部署形态，不含私有 hostname、bucket、key、端口或日志。
- [x] 添加 Docker runtime HEALTHCHECK 探针 `/api/health`，跟随 `CHAT_ADDR`（包括非默认部署监听地址）。
- [x] 将 light mode 设为首次运行的默认姿态，面向飞书/Lark 风格验收。
- [x] 重做移动端 composer，Markdown 工具收起为图标，textarea 保持可用。
- [x] 添加 `docs/visual-acceptance.md`，含 screenshot metrics 和 `gpt-image-2` 参考 prompt。
- [x] 添加 `npm run visual:acceptance`，覆盖 desktop/tablet/mobile light/dark screenshot 和 JSON metrics。
- [x] 修复生产构建静态资源被计入 REST API rate limit 的问题；`/api/...` 保持限流，静态 SPA 资源不限。
- [x] 完成 desktop、tablet、mobile light/dark 模式的 Playwright screenshot 复核。
- [x] 在 screenshot 显示 768px 平板 textarea 被挤压至 144px 后，将桌面布局断点从 `md` 移至 `lg`；最终平板 textarea 为 456px。
- [x] 将移动端辅助操作收入更多菜单，确保「公共聊天」可读而非截断为「公...」。
- [x] 收紧移动端消息密度：更小的移动端气泡字号、更窄的气泡内边距、减少记录/日期分隔线内边距，移除非本人底部重复时间戳。
- [x] 加固 `npm run visual:acceptance`：种子消息等待输入发送守卫后上屏，若验收消息少于 4 条则快速失败。
- [x] 为移动端标题截断、移动端消息字号、最低可见消息密度添加视觉硬门槛。
- [x] 将每条消息的 hover 操作合并为单个 44px 操作菜单，保留 copy、forward、translate、react、pin、edit、delete、select 流程。
- [x] 将 header 操作、Markdown 工具栏控件、定时消息入口、侧栏工具按钮、可点击头像和消息操作按钮提升至 44px 视觉验收目标。
- [x] 收紧视觉验收 metrics，正确处理隐藏/屏外控件和祖先透明度。
- [x] 在干净的临时 SQLite DB 上重新运行视觉验收，确保最终 screenshot 仅包含种子 Demo 记录。
- [x] 收紧桌面侧栏首屏密度：4 张 model preview card、紧凑空状态、online-user 区位置的视觉门槛。
- [x] 经 screenshot 复核后减轻核心聊天界面视觉重量：message bubble 使用更轻的边框，composer 工具按钮不再渲染为粗边框块，可点击头像使用 46px 安全底板以确保稳定 44px 验收。
- [x] 添加真实 group-info 视觉验收场景：创建群组、打开右侧管理面板、验证仅 owner 可见的 Webhook 区、以 44px 目标对面板控件做硬门槛。
- [x] 将 group-info 管理控件、Webhook 操作、成员行、右键菜单、确认操作和可见群组侧栏行提升到稳定的 44px 目标。
- [x] 修复前端 `group_info` 处理以读取后端 `group_members` role payload，owner/admin 状态在真实 WebSocket round trip 后正确驱动群组信息和 Webhook 管理。
- [x] 在 screenshot 复核发现 header 挤压和空群内容稀疏后，为 group-info 截图门槛添加桌面标题单行稳定性和群组首屏空状态可见检查。
- [x] 添加浏览器 E2E 覆盖完整 Webhook ingress 闭环：群组管理员通过 UI 创建一次性 webhook，对生成的 HTTP URL 发 POST，在群组记录中可见外部消息。
- [x] 重申多模态 UI 验收：有意义的 UI 打磨需要真实浏览器 screenshot 和 metrics；`gpt-image-2` mockup 仅允许作为美学参考。
- [x] 添加 webhook secret rotation：store 级 `RotateWebhookSecret`，含 SQLite 事务化 audit logging（created/rotated/deleted），旧 secret 即时失效，新一次性 secret 仅返回创建者。
- [x] 添加 `webhook_rotate` 和 `webhook_audit_list` typed WebSocket event，含 owner/admin 权限检查和脱敏 audit DTO。
- [x] 添加前端 rotation UI：每 webhook 行的 rotate 按钮（44px）、带刷新的 audit log 面板、轮换时一次性 secret 显示、rotated-at/rotated-by 元数据。
- [x] 扩展视觉验收：group-info 场景现在创建 webhook 并对 webhook 行、rotate 按钮、audit log 条目和 created-secret 显示做硬门槛。
- [x] 为 rotation secret 失效、audit log 脱敏和权限检查添加 focused store 和 hub 测试。
- [x] 为 rotation state（一次性 secret 隔离、rotated 元数据、audit log 存储）添加前端 store 测试，及 rotate 按钮和 audit 渲染的 GroupInfoPanel 测试。

## 后续产品任务

1. 群组视频通话浏览器 smoke/E2E（双会话或 mock WebRTC/media 边界）。~~（store 逻辑已覆盖：participants 计算、isGroupCall/groupName 设置与清除）~~
2. ~~消息输入对等增强：上箭头编辑上一条消息、slash commands、emoji 快捷码展开。~~（已实现，已补测）
3. 消息列表打磨：~~日期分隔线、timestamp hover~~（已实现）、更流畅的新消息和会话切换过渡。
4. 管理/安全界面：2FA 方案、管理仪表盘、audit log 设计、邀请码管理加固。
5. 性能 pass：消息列表 profiling、bundle/chunk review、WebSocket fanout/load check。
6. AgentHub 反馈笔记：总结哪些 webhook/group/call/media 原语应迁移到 AgentHub Hub API。

## 验证台账

记录当前增量的实际运行命令。

| 日期 | 命令 | 结果 |
|---|---|---|
| 2026-05-23 | `cd backend; go test ./store -run "Test(CreateWebhookDoesNotPersistPlaintextSecret|WebhookPlaintextSecretMigrationHashesExistingRows|RotateWebhookSecretInvalidatesOldSecretAndAudits)"` | PASS |
| 2026-05-23 | `cd backend; go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin|AuditListRedactsMetadataAndRequiresGroupAdmin)"` | PASS |
| 2026-05-23 | `cd backend; go test ./handler -run "TestWebhookHandlerVerifiesHashedSecret|TestHealthCheck|Test(RateLimitMiddleware|ShouldRateLimitAPI|WSAllow)"` | PASS |
| 2026-05-23 | `cd backend; go test ./...` | PASS |
| 2026-05-23 | `cd frontend; npm test -- --run src/stores/chatStore.test.ts src/components/GroupInfoPanel.test.tsx` | PASS |
| 2026-05-23 | `cd frontend; npm test` | PASS, 18 files / 237 tests |
| 2026-05-23 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-23 | `cd frontend; npm run build` | PASS |
| 2026-05-23 | `docker build --check -f Dockerfile . && docker build --check -f Dockerfile.runtime .` | PASS |
| 2026-05-23 | `docker build -f Dockerfile.runtime ... && docker run ... -e CHAT_ADDR=:3000` → `docker inspect .State.Health.Status` | PASS, healthy |
| 2026-05-23 | `cd frontend; VISUAL_BASE_URL=http://127.0.0.1:8091 npm run visual:acceptance` | PASS。完整 UI 验收 history 见 v0.2.5 CHANGELOG |
| 2026-05-23 | `cd frontend; E2E_BASE_URL=http://127.0.0.1:8102 npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium` | PASS |
| 2026-05-23 | `cd frontend; E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium` | PASS, 18/18 |
| 2026-05-23 | `git diff --check` | PASS |
| 2026-05-23 | 搜索已删除交接文件的所有过期引用，排除 `node_modules`、`.git` 和 `.worktrees` | PASS，无匹配 |
## Review Gates

提交或交接有意义的变更前：

- [x] `git diff --check`
- [x] `cd backend && go test ./...`
- [x] `cd frontend && npx tsc --noEmit`
- [x] 涉及文件的 Focused 前后端测试
- [x] 文档更新（protocol、security、用户可见行为和 AgentHub validation 笔记）
- [x] `tmp_*` 或无关本地文件不暂存

## 已完成基线

- 核心聊天：公共房间、DM、群组、好友、reactions、在线状态、typing。
- 数据完整性：SQLite 持久化、离线 DM、历史 reactions、消息上限、作用域 typing。
- IM 打磨：未读角标、草稿、滚动记忆、搜索跳转、转发、流式节流、中文 mentions、CSP/XSS 加固。
- 高级功能：已读回执、最后在线、@mention 通知、通知声音、屏蔽、文件分享。
- 进阶 IM：置顶/书签、群组邀请流程、threaded replies、范围搜索、无限历史、typing 预览、自定义 emoji。
- 平台：PWA shell、前端单元测试、后端 WebSocket/store 测试、无障碍基线、Bot/Agent mention 路由。
