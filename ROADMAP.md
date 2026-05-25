# TokenDanceChat ROADMAP

最后更新：2026-05-25

发布: [v0.2.13](https://github.com/TokenDanceLab/TokenDanceChat/releases/tag/v0.2.13) | Docker: `tokendancechat:v0.2.13` | 测试: **1078** 前端 / 52 文件 / Backend **6/6** / Skills **6** 活跃 / CI 全绿 | OIDC + session auth

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
| P2 | OIDC / 会话鉴权 | TokenDance ID 统一登录：`CHAT_OIDC_ENABLED` 控制；本地/OIDC 登录签发应用 `session_token`，保护 REST 与注册用户 WS join。 |
| P2 | UI/美术方向 | 克制企业 UI + 流畅聊天交互；避免装饰性营销布局。 |

## 当前增量（dev）：测试覆盖 + 性能优化 + UI 打磨 + 工程基建

状态：持续推进。1078 tests / 52 files / tsc 0 / ESLint 0 / CI 就绪 / E2E 本地 public preview PASS / Backend 6/6 PASS；session/public-preview focused 回归 9 文件 / 369 tests。

- [x] 应用会话鉴权：login/register/OIDC redeem/exchange 返回 HMAC `session_token`；受保护 REST 端点要求 `Authorization: Bearer <session_token>`；本地注册用户 WebSocket join 发送应用 session token，OIDC 用户仍发送 OIDC access token，游客不发送 token。
- [x] REST 权限加固：search/export/upload/emoji/invite/admin stats 不再信任 query/body username；search 按认证用户过滤公开、DM、群组成员和 deleted 状态。
- [x] Group export 权限加固：`conversation=group:<name>` 导出前验证调用者群组成员身份，非成员返回 `NOT_IN_GROUP`，并补 focused regression。
- [x] Webhook ingress 权限/资源边界加固：HTTP 入口仅接受 `Authorization: Bearer <secret>`，拒绝 query secret；请求体 8 KiB、content 2000 字符；sender 固定为服务端 `webhook`，前端/E2E 改为 header 调用。
- [x] Webhook ingress 实时链路修复：HTTP POST 现在持久化为群组消息、携带真实消息 ID，并通过 `SendToGroup` 只分发给在线群成员；浏览器 E2E 验证群组消息中只显示一次。
- [x] 前端 WebSocket 重复投递修复：`useWebSocket()` 多消费者共享一套事件订阅，`chatStore.addMessage` 按持久化 message ID 去重，避免 App/ChatLayout/AuthModal 多处挂载导致重复气泡。
- [x] CI/部署验证基线加固：GitHub Actions 增加 public-preview production build smoke、视觉验收和 artifact 上传；`docker-compose.yml` 和 `scripts/verify.ps1` 显式建模 `CHAT_DB_PATH`、`CHAT_SESSION_SECRET`、OIDC 开关和 frontend dist。
- [x] Compose 部署 fail-closed：`docker-compose.yml` 缺少 `CHAT_SESSION_SECRET` 时拒绝渲染配置，并透传 `CHAT_MEDIA_S3_*` / `CHAT_MEDIA_WEBDAV_*`；`.env.example` 默认不再 copy-enable 空 S3/OIDC 配置。
- [x] OIDC provider 资源边界加固：discovery、JWKS、token exchange、refresh 统一走 5s timeout HTTP client，并对 provider 响应体设置大小上限；focused tests 覆盖 timeout 和 oversized response。
- [x] OIDC runtime 资源边界加固：state/redeem token store 设置容量上限，满载时拒绝新建而不静默淘汰既有登录流程；store cleanup loop 可关闭，`SetupOIDC` 失败不安装 transient store，重配置会关闭旧 store；OIDC endpoint 独立 per-IP rate limit 提升为完整 redirect flow 预算；rate limiter 清理过期 IP entry。
- [x] 可信反代客户端 IP：新增 `CHAT_TRUSTED_PROXY_CIDRS`，只有可信反代来源的 `X-Forwarded-For` / `X-Real-IP` 会参与 REST、auth、OIDC 和 WS 限流，避免 nginx 后所有用户共享同一 `RemoteAddr` bucket。
- [x] 本地验证脚本防假绿：`scripts/verify.ps1` 在每个 native 命令后检查 `$LASTEXITCODE`，避免 `Select-Object`/`Out-Null` 管道吞掉 `go`/`npm`/`npx`/`docker`/`git` 失败状态；已用故意失败的 `GOFLAGS=-badflag` 反向烟测确认脚本会 exit 1。
- [x] 本地视觉门不再静默跳过：`scripts/verify.ps1` 未提供 `VISUAL_BASE_URL` 时会自行启动临时生产后端、等待 `/api/health`，运行 `npm run visual:acceptance`，并在结束后清理临时 DB 和进程。
- [x] 移动侧栏触控视觉门：`visual-acceptance.mjs` 新增 `mobile-light-sidebar-open` 场景，打开移动侧栏后对侧栏内可见控件做 44px hard gate；`Sidebar.tsx` 同步提升关闭、搜索、建群、主行、三点菜单和底部工具栏命中区。
- [x] 交接报告脱敏：`docs/handoff-report-2026-05-25.md` 删除具体主机别名、内网 IP、宿主机端口、真实域名、容器路径和 SSH 命令，改为部署运行契约与本地/占位验证命令。
- [x] 游客只读预览 P0：未登录首页通过 `GET /api/messages?limit=100` 拉取公开历史，接口失败时也结束骨架屏；保持不设置 username、不打开 WebSocket，点击「加入聊天」再进入 AuthModal 游客加入流程。
- [x] 为游客预览添加 focused App/API 测试和当前 UI 的 Playwright 生产 smoke，避免旧认证入口 E2E 选择器误报。
- [x] 修复未登录公共预览输入框聚焦时的全屏格式化遮罩拦截问题：composer popover 仅在已登录且输入框可用时打开，并以 ChatInput focused regression test 固化。
- [x] 对齐前端 `index.html` 与 Go 后端 runtime CSP：移除 Google Fonts 外链，改用系统字体，避免视觉验收控制台 CSP 报错。
- [x] 更新视觉验收脚本以适配当前 AuthModal 文案、composer selector 和 group-info Webhook/audit 场景。
- [x] 完成 2026-05-25 视觉验收复核：desktop/tablet/mobile light/dark + group-info 截图和 metrics 全部无 issues，详见 `docs/visual-acceptance.md`。
- [x] SettingsModal macOS/liquid-glass 增量：弹窗改为 portal 挂载到 `document.body`，避免桌面 Sidebar transform 捕获 fixed 定位；桌面/移动布局响应式收敛，所有设置弹窗内可视控件达到 44px 触控门槛；`visual-acceptance.mjs` 新增 desktop/mobile settings 场景并门控 tab label 裁剪。
- [x] AuthModal macOS/liquid-glass 增量：认证卡片、tab、关闭、密码显示、主按钮、inline switch 和 OIDC 链接纳入 44px 触控目标；`visual-acceptance.mjs` 新增 desktop login 与 mobile register error 场景，门控 modal fit、tab label 裁剪、错误态可见性和弹窗内小控件。
- [x] ChatInput composer macOS/liquid-glass 增量：composer 保持单一玻璃卡片，底部常驻 Markdown/图片/文件/emoji/GIF/定时/录音一排工具；桌面/移动端工具按钮和发送按钮保持 44px 触控目标，默认聚焦不再弹出旧 Markdown 浮层；`visual-acceptance.mjs` 门控 `composerTools=7/7`、`composerSmallControls=0` 和消息密度。
- [x] SW 缓存修复：CACHE_NAME tdchat-v3 + stale-while-revalidate 策略，防止部署后浏览器加载旧 JS/CSS。
- [x] api.ts connect 竞态修复：connectGeneration 计数器替代 intentionalClose 布尔值，消除旧 onclose 在新 onopen 后触发的竞态。
- [x] E2E 修复：back button label "Back" → "返回"（zh-CN context），3 个测试恢复。
- [x] Group-call E2E 邀请接受：acceptGroupInvite helper，member 接受邀请后群组通话按钮出现。4/7 通过。
- [x] 测试覆盖扩展：useWebSocket 3.37%→44.56%（+30 tests）、AuthModal/public preview 回归、ChatInput +14 tests（875 total）。
- [x] PM 审计全修复 (P1+P2)：AI 助手默认展开、文件上传错误提示、麦克风权限反馈、Sidebar 空状态 CTA 提示、分页超时重试按钮、移动端工具栏按钮可见、zh-CN 字符串全部中文化、录音提示 i18n。
- [x] Utils i18n 重构：formatTime/formatDate/formatLastSeen 从 lang 参数改为 t() 函数，消除 8 处内联双语三元，新增 profile.today/yesterday 键。
- [x] E2E 真实用户流：7 tests（emoji reaction、message edit、search、settings、GIF picker）。
- [x] MessageBubble 测试 +21（代码块、语音消息、GIF/贴纸、编辑标记、搜索高亮、回复预览、转发标记、删除消息 — 覆盖率 32%+）。
- [x] 后端测试扩展 +12：handler 边界用例（CORS、rate limit、login/register/DM/group/upload）、ws 边界、hub 边界（含 Stop 幂等性验证）。
- [x] 交叉审查驱动修复：api.ts gen guard 补全（onerror/onopen/onmessage/timeout）、ReadReceipt t 作用域、VideoCall formatTime 参数数量、SW activate clients.claim()。
- [x] Sidebar 测试 +38：上下文菜单置顶/归档/文件夹操作、音效开关、好友标记、在线用户状态（55%→65%+，90 tests total）。
- [x] VideoCall 测试 +27：铃声、计时器、PiP 拖拽、peer 网格、静音/摄像头/屏幕共享、通话状态机（25%+，35 tests total）。
- [x] E2E 边界用例 +8：Poll 长问题/单选拒绝/特殊字符、Sidebar 去重/离开/清除搜索、多用户跨标签。
- [x] Backend store +18：Message CRUD、Profile 更新、Friend 操作、Search 分页、Room CRUD。
- [x] Kick 重连循环修复：kicked 后清空 reconnectUsername，阻止 ping-pong 重连。
- [x] E2E production fixes x3（target 47/52）。
- [x] nginx production fix：agenthub-chat.conf 冲突修复。
- [x] 前端测试从 237 → 779 (+542 tests / +31 文件 / 51.86% 行覆盖率)。
- [x] handler +10、CustomEmojiPicker +13、ProfileEditModal +18 focused tests。
- [x] E2E 47/52 pass against production（3 fixes 进行中，target 47/52）。
- [x] E2E 测试从 18 → 64+，5 套 suites：auth、dm、group、poll、reconnect、sidebar、webhook。
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
- [x] 性能优化：O(1) reaction/read_by 查找表（Map 预索引）、onlineUsers prop 下沉至 MessageBubble、emoji 预处理提升。
- [x] WebSocket 自动重连：指数退避 + jitter（1s/2s/4s/8s/16s 上限），重连期间 banner 提示。
- [x] 发送失败反馈：WebSocket 断开时发送按钮红色闪烁 + 警告 toast。
- [x] URL 预览卡片：紧凑型，500ms 防抖，年龄分级过滤，加载/错误/溢出状态覆盖。
- [x] E2E dm-flow 测试（10 tests）。
- [x] 在线用户加载骨架屏。
- [x] FAB 未读计数徽章。
- [x] SettingsModal + SettingsPanel 测试。
- [x] 项目 Skills 扩展至 5 个：verify、pm-audit、deploy、cross-review、i18n-scan（`.agents/skills/`）。
- [x] a11y i18n 补全：28 keys，~20 文件，无障碍翻译全覆盖。
- [x] 性能优化：lastPreviews O(1) 查找、replyCounts 缓存。
- [x] Hub.Stop()：goroutine-safe test cleanup，消除测试间资源泄露。
- [x] formatTime/formatLastSeen lang 参数（i18n P3 完成）。
- [x] 滚动修复（4 轮迭代：scrollIntoView→min-h-0→willChange→flex flex-col on parent）：根因是父容器须为 flex 容器，子元素 flex-1 才能约束高度供 overflow-y-auto 使用。浏览器实测验证（double rAF），E2E 8/8 全绿。
- [x] 源码 bug 修复：Register 保留用户名检测 + HealthCheck 方法强制实施。
- [x] isReservedUsername 导出供 handler 层使用。
- [x] WebSocket connect 竞态修复：连接建立与 kicked 事件处理间的 race condition。
- [x] intentionalClose 异步窗口修复：重连流程中 intentionalClose 必须保持 true 直到新 onopen 触发，防止重连期间的 close 被误判为非预期断开。

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

## 当前增量：Poll 前端集成 + AdminPanel i18n + 后端测试扩展 + i18n-scan skill

状态：已实现、已测试、已通过。

- [x] Poll 前端集成：创建/投票/结果展示 UI，typed WebSocket event 前后端闭环。
- [x] AdminPanel 完整 i18n：所有管理界面文案国际化，中英文覆盖。
- [x] 后端测试扩展：main 模块集成测试 + media 模块 focused 测试。
- [x] i18n-scan skill：沉淀 i18n 扫描、键值校验、未翻译检测为可复用 SOP（`.agents/skills/i18n-scan.md`）。
- [x] 前端测试从 644 扩展至 695（46 文件），后端测试保持全量 PASS。

## 后续产品任务

1. 群组视频通话浏览器 smoke/E2E（双会话或 mock WebRTC/media 边界）。~~（store 逻辑已覆盖：participants 计算、isGroupCall/groupName 设置与清除）~~
2. ~~消息输入对等增强：上箭头编辑上一条消息、slash commands、emoji 快捷码展开。~~（已实现，已补测）
3. 消息列表打磨：~~日期分隔线、timestamp hover~~（已实现）、更流畅的新消息和会话切换过渡。
4. 管理/安全界面：2FA 方案、管理仪表盘、audit log 设计、邀请码管理加固。
5. 性能 pass：消息列表 profiling、bundle/chunk review、WebSocket fanout/load check。（已推进：O(1) reaction/read_by 查找表、emoji 预处理、onlineUsers prop 下沉）
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
| 2026-05-23 | `cd frontend; npm test` | PASS, 43 files / 672 tests |
| 2026-05-23 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-23 | `cd frontend; npm run build` | PASS |
| 2026-05-23 | `docker build --check -f Dockerfile . && docker build --check -f Dockerfile.runtime .` | PASS |
| 2026-05-23 | `docker build -f Dockerfile.runtime ... && docker run ... -e CHAT_ADDR=:3000` → `docker inspect .State.Health.Status` | PASS, healthy |
| 2026-05-23 | `cd frontend; VISUAL_BASE_URL=http://127.0.0.1:8091 npm run visual:acceptance` | PASS。完整 UI 验收 history 见 v0.2.5 CHANGELOG |
| 2026-05-23 | `cd frontend; E2E_BASE_URL=http://127.0.0.1:8102 npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium` | PASS |
| 2026-05-23 | `cd frontend; E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium` | PASS, 18/18 |
| 2026-05-23 | `git diff --check` | PASS |
| 2026-05-23 | 搜索已删除交接文件的所有过期引用，排除 `node_modules`、`.git` 和 `.worktrees` | PASS，无匹配 |
| 2026-05-24 | `cd frontend; npm test` | PASS, 47 files / 716 tests |
| 2026-05-24 | `cd backend; go test ./...` | PASS |
| 2026-05-24 | `cd backend; go test ./hub -run "TestRegister"` | PASS（保留用户名检测 + HealthCheck 强制实施） |
| 2026-05-24 | `cd frontend; npx playwright test src/e2e/ --project=chromium` | PASS（E2E 修复后） |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 779 tests, 51.86% lines |
| 2026-05-24 | `cd backend; go test ./...` | PASS |
| 2026-05-24 | `cd frontend; E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium` | 47/52 pass（3 fixes pending） |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 794 tests, 51.86% lines |
| 2026-05-24 | `cd backend; go test ./...` | PASS |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 896 tests |
| 2026-05-24 | `cd backend; go test ./...` | PASS, 6/6 (handler +12 tests) |
| 2026-05-24 | `cd frontend; E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium` | 105/108 pass（3 group-call timing, 17 skipped, +7 real-user-flows） |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 1078 tests |
| 2026-05-24 | `cd backend; go clean -testcache && go test ./...` | PASS, 6/6 (handler media +28, main +20, hub +19, store +18, picoclaw +23, llm +22) |
| 2026-05-24 | `cd frontend; npx playwright test src/e2e/ --project=chromium` | 160/166 pass (3 group-call timing, 3 skipped) |
| 2026-05-24 | `git checkout master && git merge dev && git push` | Merged (23x), 60+ files changed |
| 2026-05-25 | `cd frontend; npm test -- --run src/App.test.tsx src/lib/api.test.ts` | PASS, 2 files / 176 tests |
| 2026-05-25 | `cd frontend; npm test -- --run src/App.test.tsx -t StrictMode` | PASS, 1 focused test |
| 2026-05-25 | `cd frontend; npm test -- --run src/App.test.tsx src/lib/api.test.ts src/components/ChatLayout.test.tsx src/components/Sidebar.test.tsx` | PASS, 4 files / 297 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd frontend; E2E_BASE_URL=http://127.0.0.1:18080 npx playwright test src/e2e/public-preview-smoke.test.ts --project=chromium --workers=1` | PASS, 1/1 |
| 2026-05-25 | `cd backend; go test ./...` | PASS, cached |
| 2026-05-25 | `cd frontend; npm test -- --run src/components/ChatInput.test.tsx` | PASS, 44 tests |
| 2026-05-25 | `cd frontend; npm test -- --run src/components/ChatInput.test.tsx src/components/Sidebar.test.tsx` | PASS, 2 files / 134 tests |
| 2026-05-25 | `cd frontend; VISUAL_BASE_URL=http://127.0.0.1:18082 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-24T19-07-39-625Z`, all scenarios no issues |
| 2026-05-25 | `cd backend; go test ./store -run TestSearchMessagesForUserFiltersPrivateAndDeletedResults` | PASS |
| 2026-05-25 | `cd backend; go test ./handler -run TestSearchUsesAuthenticatedUserScope` | PASS |
| 2026-05-25 | `cd backend; go test ./...` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | `cd frontend; npm test -- --run` | PASS, 52 files / 1078 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd frontend; npx eslint .` | PASS, 0 errors / 91 warnings |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | submit-time leak scan (`git grep` x3 + `git log --grep`) | PASS, zero output |
| 2026-05-25 | `cd backend; go test ./handler -run "TestExportMessages(GroupRequiresMembership|GroupAllowsMember|DMUsesSessionUsername|JSON|Text|InvalidFormat|WrongMethod|VeryLargeLimit|WithinLimit|ZeroLimit)$" -count=1` | PASS |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS |
| 2026-05-25 | `docker compose config` | PASS |
| 2026-05-25 | `cd backend; go test ./handler -run "TestWebhookHandler(VerifiesHashedSecret|RejectsQuerySecret|RejectsOversizedBody|RejectsOversizedContent|UsesServerDerivedSender)$" -count=1` | PASS |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | `cd frontend; npm test -- --run src/components/GroupInfoPanel.test.tsx src/stores/chatStore.test.ts src/hooks/useWebSocket.test.ts` | PASS, 3 files / 151 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npx eslint .` | PASS, 0 errors / 90 warnings |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `E2E_BASE_URL=http://127.0.0.1:18135 npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium --workers=1 --reporter=line` | PASS, webhook message visible once as `webhook` |
| 2026-05-25 | `docker compose config` | PASS |
| 2026-05-25 | `rg -n "secret=|请立即复制，密钥|Copy now; the secret|Webhook secrets are passed|sender spoof|ci-webhook"` | PASS, only intentional test assertions/body-spoof fixture remain |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `$env:GOFLAGS='-badflag'; .\scripts\verify.ps1 -SkipVisual -SkipDocker` | EXPECTED FAIL, script exited 1 at `go test ./...`, proving native exit-code failures are no longer hidden by PowerShell pipelines |
| 2026-05-25 | `cd frontend; npm test -- --run src/components/Sidebar.test.tsx` | PASS, 1 file / 91 tests |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:18137 npm run visual:acceptance` | PASS, added `mobile-light-sidebar-open`; `sidebarSmallControls=0` |
| 2026-05-25 | `.\scripts\verify.ps1 -SkipVisual -SkipDocker` | PASS, backend tests, frontend tests, tsc, frontend build, backend build, `git diff --check` |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 18136,18137 -State Listen` | PASS, no lingering visual-test backend listeners |
| 2026-05-25 | `rg -n "hk2|Tailscale|100\.|chat\.vectorcontrol\.tech|ssh |/app/data|/app/frontend|C:\\Users\\Ding\\server|生产 URL|容器日志|scp |docker exec|docker logs" docs\handoff-report-2026-05-25.md` | PASS, no matches after handoff report sanitization |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDCHTTPClientHasBoundedTimeout|ReadOIDCResponseBodyRejectsOversizedResponse|OIDCConfigHandler|OIDCLoginRedirect|OIDCCallbackSuccess|OIDCRefresh|OIDCExchange|VerifyOIDCJoinToken)$" -count=1` | PASS, OIDC provider timeout/body-cap regression |
| 2026-05-25 | Compose env rendering check: missing `CHAT_SESSION_SECRET` then with `CHAT_SESSION_SECRET=compose-config-test-secret docker compose config` | PASS, missing secret exit 1; configured render exit 0 with S3/WebDAV/session envs present |
| 2026-05-25 | `.\scripts\verify.ps1 -SkipDocker` | PASS, backend tests, frontend tests, tsc, frontend build, backend build, `git diff --check`, self-started visual backend on 8198; `mobile-light-sidebar-open sidebarSmallControls=0` |
| 2026-05-25 | `rg -n "http\.Get|http\.PostForm|io\.ReadAll\(resp\.Body\)" backend\handler\oidc.go` | PASS, no unbounded OIDC provider calls remain |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDCStateStoreRejectsNewEntriesAtCapacity|OIDCTokenStoreRejectsNewEntriesAtCapacity|RequestIPUsesForwardedForFromTrustedProxy|RequestIPIgnoresSpoofedForwardedForPrefix|RequestIPIgnoresForwardedForFromUntrustedRemote|OIDCAllowBudgetsFourCompleteRedirectFlows|RateLimiterPrunesExpiredIPEntries|OIDCLoginRateLimitedByIP|OIDCRefreshWrongMethodDoesNotConsumeOIDCRateLimit|OIDC(LoginRedirect|CallbackSuccess|Refresh|Exchange|VerifyOIDCJoinToken)|RateLimit|AuthAllow|WSAllow)$" -count=1` | PASS, OIDC runtime bounds + trusted proxy IP + rate-limit cleanup |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDC|RateLimit|AuthAllow|WSAllow)" -count=5 -shuffle=on` | PASS, OIDC/rate-limit tests stable under shuffle/repeat |
| 2026-05-25 | `cd backend; go test ./handler -count=1` | PASS, handler package full regression after spoofed XFF parser update |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | `CHAT_SESSION_SECRET=compose-config-test-secret CHAT_TRUSTED_PROXY_CIDRS=127.0.0.1/32 docker compose config` | PASS, compose renders session secret and trusted proxy CIDRs |
| 2026-05-25 | OIDC stale wording scan over root docs and `docs/` | PASS, no stale OIDC-open wording; new spoofed-prefix regression appears in handoff test lists |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `gofmt -w backend\handler\oidc.go backend\handler\oidc_test.go backend\handler\ratelimit.go backend\handler\ratelimit_test.go` | PASS |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDCStateStoreCloseStopsCleanupLoop|OIDCTokenStoreCloseStopsCleanupLoop|SetupOIDCFailureDoesNotInstallTransientStores|SetupOIDCReconfigureClosesPreviousTransientStores|OIDCStateStoreRejectsNewEntriesAtCapacity|OIDCTokenStoreRejectsNewEntriesAtCapacity|RequestIPUsesForwardedForFromTrustedProxy|RequestIPIgnoresSpoofedForwardedForPrefix|RequestIPIgnoresForwardedForFromUntrustedRemote|OIDCAllowBudgetsFourCompleteRedirectFlows|RateLimiterPrunesExpiredIPEntries|OIDCLoginRateLimitedByIP|OIDCRefreshWrongMethodDoesNotConsumeOIDCRateLimit|OIDC(LoginRedirect|CallbackSuccess|CallbackInvalidState|Refresh|Exchange|VerifyOIDCJoinToken|ConfigHandler)|RateLimit|AuthAllow|WSAllow)$" -count=1` | PASS, OIDC store lifecycle + runtime bounds + trusted proxy IP + rate-limit cleanup |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDC|RateLimit|AuthAllow|WSAllow)" -count=5 -shuffle=on` | PASS, OIDC/rate-limit tests stable under shuffle/repeat after store lifecycle changes |
| 2026-05-25 | `cd backend; go test ./handler -count=1` | PASS, handler package full regression after store lifecycle changes |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | `CHAT_SESSION_SECRET=compose-config-test-secret CHAT_TRUSTED_PROXY_CIDRS=127.0.0.1/32 docker compose config` | PASS, compose renders session secret and trusted proxy CIDRs |
| 2026-05-25 | OIDC provider/static stale wording scans | PASS, no unbounded OIDC provider calls and no stale OIDC-open wording |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `cd frontend; npm test -- src/components/SettingsModal.test.tsx` | PASS, 1 file / 23 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:8198 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-24T23-17-29-081Z`; settings scenarios `720x560` desktop / `366x720` mobile, `settingsSmallControls=0`, tab labels not clipped |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 8198 -State Listen` | PASS, no lingering visual-test backend listener |
| 2026-05-25 | `node --check frontend\scripts\visual-acceptance.mjs` | PASS |
| 2026-05-25 | `cd frontend; npm test -- src/components/AuthModal.test.tsx src/components/OidcLoginButton.test.tsx` | PASS, 2 files / 10 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:8198 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-24T23-50-02-927Z`; auth scenarios `380x346` desktop login / `358x502` mobile register error, `authSmallControls=0`, error alert visible |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 8198 -State Listen` | PASS, no lingering visual-test backend listener |
| 2026-05-25 | subagent read-only design review for next gap | Completed, recommended ChatInput composer convergence + dedicated visual gates |
| 2026-05-25 | `node --check frontend\scripts\visual-acceptance.mjs` | PASS |
| 2026-05-25 | `cd frontend; npm test -- src/components/ChatInput.test.tsx src/components/ScheduleButton.test.tsx` | PASS, 2 files / 50 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:8198 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-25T00-15-30-088Z`; all 12 scenarios `composerTools=7/7`, `composerSmallControls=0`, no issues |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 8198 -State Listen` | PASS, no lingering visual-test backend listener |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |

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
