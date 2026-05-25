# TokenDanceChat Agent 指南

最后更新：2026-05-25

## 项目定位

TokenDanceChat 是 AgentHub 的技术验证项目和可玩 Demo。

它通过真实聊天产品界面验证 AgentHub 的 Hub/IM 技术栈：

- Go Hub Server，typed WebSocket events。
- SQLite/FTS5 持久化（早期 Hub state）。
- React 19 + Zustand + Vite 客户端状态与 UI。
- Agent-as-contact UX：TokenBot、PicoClaw、mentions、DM、群组协作、流式回复。

本仓库不应演化为独立长期产品架构。可复用的经验应回流到 `D:\Code\TokenDance\AgentHub`。

在 `D:\Code\TokenDance` workspace 内做跨系统治理时，先读根级 `..\AGENTS.md` 和 `..\docs\`：
- 身份/OIDC/鉴权：`..\docs\identity-auth.md`
- 跨产品授权模型：`..\docs\authorization-model.md`
- 统一第三方登录：`..\docs\unified-login.md`
- 安全风险治理：`..\docs\security-risk-governance.md`
- 产品矩阵/包装：`..\docs\product-matrix.md`
- 生态产品需求队列：`..\docs\ecosystem-product-backlog.md`
- 生态执行队列：`..\docs\ecosystem-execution-queue.md`
- 本仓库治理执行台账：`docs\governance-execution.md`
- Agent/SEO/i18n：`..\docs\agent-seo-i18n-packaging.md`
- i18n parity：`..\docs\i18n-parity-matrix.md`
- 设计系统：`..\docs\design-system.md`
- 设计落地手册：`..\docs\design-implementation-playbook.md`
- 视觉 QA 矩阵：`..\docs\visual-qa-matrix.md`
- 文档治理：`..\docs\document-governance.md`
- 治理评分和模板：`..\docs\governance-scorecard.md`、`..\docs\issue-templates.md`

### TokenDance ID 登录边界

TokenDanceChat 只作为 TokenDance ID relying party。不要在本仓库新增 GitHub、Google、飞书等直连第三方登录；provider 选择、TokenDance ID 账号自动创建和 OAuth 绑定都由 TokenDance ID 处理。Chat 侧只维护自己的 TokenDance ID OAuth client、回调、token 验证、聊天本地会话/重连语义。

如果后续接入 TokenDance Relay 调用模型 API，Chat 后端应使用 Relay API key 或服务端托管的 Relay 凭据；不要把 TokenDance ID access token 当作 `api.vectorcontrol.tech/v1` 的模型 API key，也不要把 Relay API key 暴露给浏览器。
Relay 产品化、公开 quickstart、状态语义和公开/私有边界见 `..\docs\relay-productization.md`。Chat 文档只把 Relay 描述为模型 API 中转站，不复述 server 私有运行细节。

### 授权边界

Chat 侧权限以本仓库自己的用户、房间/群组 membership、admin 标记、webhook ownership 和 media/webhook secret 规则为准。TokenDance ID 只提供登录身份；不要用 `email`、第三方 provider id 或浏览器 localStorage 状态直接授权持久化写操作。

涉及 group admin、webhook secret、媒体上传、PicoClaw/TokenBot 触发、后端 session token 或 WebSocket join token 的行为变更时，同时更新 `..\docs\authorization-model.md` 或本仓库文档中的本地授权说明。

### 安全风险治理边界

TokenDanceChat 的 `docs/security-risk-register.md` 是本仓库风险事实源；跨系统 severity/status/release gate 使用 `..\docs\security-risk-governance.md`。

- 涉及公开 REST/WebSocket、OIDC session、webhook secret、invite/admin、uploads/media retention、SSRF/CORS、PWA/service worker cache、Relay key 或 bot action 的风险变更，必须同步风险表。
- Critical/High 风险未修复、未验证或未显式 accepted 前，不得把公开 demo、PWA、OIDC 或 webhook 变更标记为 release-ready。
- 生产 endpoint、日志、host、备份、secret 或 live 事故证据只放 server/private docs；本仓库公开文档只写脱敏结论和验证需求。
- 发布前从 workspace 根运行 `..\scripts\verify-security-risks.ps1 -StrictReleaseGate`；默认治理 pass 里的 security warning 是未关闭 release blocker，不是可以忽略的文档噪声。

### 产品包装与 Agent 友好度

TokenDanceChat 对外定位是 AgentHub 的 IM/Agent 交互验证场，不是独立长期产品线。公开 README、PWA metadata、`frontend/public/robots.txt`、`frontend/public/sitemap.xml`、`frontend/public/llms.txt` 必须保持这个定位。新增公开路由、离线页、语言入口或主要功能说明时，同步 `..\docs\agent-seo-i18n-packaging.md` 的检查项；修改 `TranslationDict`、OIDC、PWA/offline/error、Webhook/admin 或 Relay 文案时，同时按 `..\docs\i18n-parity-matrix.md` 做 zh-CN/en-US 语义对齐。

OIDC、PWA/i18n、设计 token、公开包装或 AgentHub 验证类工作拆 issue 时，使用 `.github/ISSUE_TEMPLATE/tokendance-chat-governance.md`。
需要把需求提升到生态级时，先对照 `..\docs\ecosystem-product-backlog.md`、`..\docs\ecosystem-execution-queue.md` 和 `docs\governance-execution.md`，尤其是 TokenDanceChat 的 OIDC session、PWA/offline/error i18n 和 AgentHub proving-ground 定位；repo issue/roadmap 应引用对应 `TD-P0-*` / `TD-P1-*` 队列 ID。

### 设计系统边界

UI 可以保留聊天产品的个性，但应逐步映射到 `..\docs\design-system.md` 的 TokenDance token intent：canvas、surface、ink、plum、moss、line、focus、radius。新增组件避免引入新的孤立颜色体系；密集聊天界面优先清晰、紧凑、可读，参考飞书/Lark 的工作感和 Telegram 的流畅消息体验。
页面/组件重做、视觉 QA、截图验收或 token 变更必须同时读 `..\docs\design-implementation-playbook.md` 和 `..\docs\visual-qa-matrix.md`。TokenDanceChat 的截图验收至少覆盖桌面和移动端的消息列表、composer、长消息、assistant/bot 状态或错误/空状态中与改动相关的场景。

## 持久化状态

- `ROADMAP.md`：长期目标账本。每次有意义的实现、验证或决策后更新。
- `AGENTS.md`：项目级操作指南。保持足够的上下文，使新 agent 可以无需单独的交接文件即可继续工作。
- `docs/agenthub-validation.md`：说明 AgentHub 映射关系。
- `docs/engineering-goal.md`：说明长期工程目标和验证期望。
- `docs/webhook-integration.md`：记录当前 webhook 协议。
- `docs/visual-acceptance.md`：定义前端打磨的 screenshot 和美学验收标准。

不要创建单独的项目交接文件。如需交接上下文，合并到本文件或 `ROADMAP.md`。

## 当前优先级

1. 在文档和实现决策中显式保持 AgentHub 验证定位。
2. 提升飞书/Lark 风格聊天功能对等度和 Telegram 级别聊天体验。
3. 优先选择 typed WebSocket protocol 变更，并配套前后端测试。
4. 在广泛 UI 打磨之前加固安全敏感合约。
5. 保持 Demo 可运行、可测试、可部署。

## 当前增量

OIDC 集成 (TokenDance ID) + 应用会话鉴权 + 性能优化 + UI 打磨 + 测试扩展 —— 持续推进（v0.2.13），**1078** 前端测试 / 52 文件 / 后端 6/6 / tsc 0 / ESLint 0 / CI 就绪；本轮 session/public-preview focused 回归 9 文件 / 369 tests。

此增量包含：
- **OIDC 集成 (TokenDance ID)**：Authorization Code + PKCE 流程，`/api/oidc/*` 5 个端点，oidc_users 表，WebSocket join token 验证，OidcLoginButton 前端组件，`App.tsx` OIDC 回调 redeem 与 `AuthModal` 登录入口。由 `CHAT_OIDC_ENABLED` 环境变量控制（默认 false，完全向后兼容）。
- **应用会话鉴权**：login/register/OIDC redeem/exchange 返回 `session_token`；受保护 REST 端点使用 `Authorization: Bearer <session_token>`；本地注册用户 WebSocket join 发送应用 session token，OIDC 用户仍发送 OIDC access token，游客不发送 token。
- **OIDC 运行时边界**：provider 调用有 5s timeout + 响应体上限；state/redeem token store 有容量上限且满载拒绝新建，cleanup loop 可关闭，`SetupOIDC` 失败不安装 transient store，重配置会关闭旧 store；OIDC endpoints 独立 per-IP rate limit。部署在 nginx/反代后必须配置 `CHAT_TRUSTED_PROXY_CIDRS`，否则 auth/OIDC/WS/API 限流只会看到反代 `RemoteAddr`。
- 测试扩展至 1078 前端 / 52 文件，后端 OIDC handler 8 个测试全 PASS。
- 原有增量（v0.2.12 积累）全部保留。

此增量包含：
- 前端测试扩展至 779 tests / 50 files（51.86% 行覆盖率）。
- E2E 测试扩展（64 tests：44 auth-flow + 8 group-call + 2 webhook + 10 dm-flow）。
- 性能优化：O(1) reaction/read_by 查找表、onlineUsers prop 下沉至 MessageBubble、emoji 预处理提升。
- WebSocket 自动重连：指数退避 + jitter（1s/2s/4s/8s/16s 上限），重连期间 banner 提示。
- 发送失败反馈：WebSocket 断开时发送按钮红色闪烁 + 警告 toast。
- URL 预览卡片：紧凑型，500ms 防抖，年龄分级过滤，加载/错误/溢出状态覆盖。
- 在线用户加载骨架屏、FAB 未读计数徽章。
- SettingsModal + SettingsPanel 测试。
- Poll 前端集成：创建/投票/结果展示 UI，typed WebSocket event 前后端闭环。
- AdminPanel 完整 i18n：管理面板全部文案国际化，中英文覆盖。
- i18n-scan skill：i18n 扫描、键值校验、未翻译检测 SOP（`.agents/skills/i18n-scan.md`）。
- 后端测试扩展：main 模块集成测试 + media 模块 focused 测试。
- 交叉审查 5 轮全部修复（HIGH + MEDIUM），安全修复 3 项。
- Hub.Stop()：goroutine-safe test cleanup，消除测试间资源泄露。
- formatTime/formatLastSeen lang 参数（i18n P3 完成）。
- 滚动修复（4 轮：scrollIntoView→min-h-0→willChange→flex flex-col on parent）：父容器须为 flex，子元素 flex-1 才能约束高度供 overflow-y-auto 使用。E2E 8/8 全绿。
- SW 缓存修复：CACHE_NAME tdchat-v3 + stale-while-revalidate，替换 cache-first，部署后浏览器自动拉取新资源。
- api.ts connect 竞态根治：connectGeneration 计数器替代 intentionalClose 布尔值，旧 onclose 在新 onopen 后触发时正确忽略。交叉审查发现 onerror/onopen/onmessage/timeout 缺少 gen guard → 已补全。
- E2E 修复：back button "Back"→"返回"，group-call 邀请接受流程（acceptGroupInvite helper），button[aria-label] 重复选择器修复。
- PM 审计修复：AI 助手默认展开、文件上传 >50MB 错误提示、麦克风权限拒绝反馈、语音录制提示 i18n、zh-CN publicChatSub 中文化、ChatInput disconnect 硬编码改用 t()。
- 测试覆盖扩展：useWebSocket 3.37%→44.56%（+30）、AuthModal/public preview 回归、ChatInput +14（875 total）。
- SW activate: clients.claim() 移入 event.waitUntil()。
- ChatLayout 测试 +14（移动端侧栏、ThreadPanel、GroupInfoPanel、重连 banner、主题循环、More 菜单 — 30 tests total）。
- E2E 错误路径 5 tests（重连、踢下线、无效邀请码、错误密码、空消息）。
- kick 重连循环修复：kicked 事件后清空 reconnectUsername，阻止 ping-pong 重连。
- 生产容器重启修复 WebSocket 连接堆积。

## v0.2.7 增量

Kick-off 机制 + 登录限流 + 挤下线 —— 已完成部署，18/18 E2E 全绿。

此增量包含：
- 同名用户在新标签页登录时自动踢掉旧连接，发送 "kicked" 消息。
- `/api/login` 和 `/api/register` 独立 auth rate limiter（5 次/分钟/IP）。
- LoginScreen / RegisterScreen `autocomplete` 属性适配密码管理器。
- hub 注册通道原子化处理重复用户名（移除 `handleJoin` 中的 `IsUsernameTaken` 预检查）。

## v0.2.6 增量

密码哈希升级 + CORS 加固 + PicoClaw 修复 + 全面测试覆盖。
- 密码从 SHA-256 升级为 bcrypt cost 12，登录时自动迁移旧哈希。
- CORS/WS origin 从通配符/裸域配置收紧为 explicit origin allowlist（`CHAT_ALLOWED_ORIGINS=https://chat.example.com,https://*.example.com`；`*` 不放行跨源请求）。
- 6 个未接入的 WS handler 已修复；PicoClaw 60s context timeout；PDF sandbox 加固。
- 237 前端单元测试 + 后端全量 + 18/18 E2E 线上实测。

## Webhook 安全 + 媒体存储 + Screenshot 驱动 UI 验收（v0.2.5）

## 架构地图

```text
backend/main.go                 HTTP + WS 入口
backend/handler/handler.go      REST handlers、auth、uploads、webhook HTTP ingress
backend/handler/media.go        local/WebDAV/S3-compatible 媒体存储
backend/hub/hub.go              Store interface、Message struct、Hub state
backend/hub/client.go           WebSocket message handlers
backend/store/store.go          SQLite schema 与 CRUD
frontend/src/lib/api.ts         typed 前端 API/WebSocket helper
frontend/src/hooks/useWebSocket.ts
frontend/src/lib/groupInfo.ts       group_info 角色规范化（处理后端 group_members payload）
frontend/src/stores/chatStore.ts
frontend/src/components/ChatLayout.tsx
frontend/src/components/MessageBubble.tsx
frontend/src/components/MessageTranscript.tsx
frontend/src/components/GroupInfoPanel.tsx
```

## 验证命令

先跑 focused checks，再跑 broad checks，最后才声称完成。

全量一键验证：`.\scripts\verify.ps1`（可选 `-SkipVisual`、`-SkipDocker`）。

```powershell
# 全量一键
cd D:\Code\TokenDance\tokendance-chat
.\scripts\verify.ps1
# Backend focused webhook 回归
cd D:\Code\TokenDance\tokendance-chat\backend
go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin|AuditListRedactsMetadataAndRequiresGroupAdmin)"
go test ./store -run "Test(CreateWebhookDoesNotPersistPlaintextSecret|WebhookPlaintextSecretMigrationHashesExistingRows|RotateWebhookSecretInvalidatesOldSecretAndAudits)"
go test ./handler -run TestWebhookHandlerVerifiesHashedSecret

# Backend focused media 回归
go test ./handler -run "Test(UploadEmojiStoresViaMediaStore|ServeEmojiReadsViaMediaStore|S3MediaStoreSaveAndOpen|MediaStoreRejectsTraversalKeys)"

# Backend focused OIDC / rate-limit 回归
go test ./handler -run "Test(OIDCStateStoreCloseStopsCleanupLoop|OIDCTokenStoreCloseStopsCleanupLoop|SetupOIDCFailureDoesNotInstallTransientStores|SetupOIDCReconfigureClosesPreviousTransientStores|OIDCStateStoreRejectsNewEntriesAtCapacity|OIDCTokenStoreRejectsNewEntriesAtCapacity|RequestIPUsesForwardedForFromTrustedProxy|RequestIPIgnoresSpoofedForwardedForPrefix|RequestIPIgnoresForwardedForFromUntrustedRemote|OIDCAllowBudgetsFourCompleteRedirectFlows|RateLimiterPrunesExpiredIPEntries|OIDCLoginRateLimitedByIP|OIDCRefreshWrongMethodDoesNotConsumeOIDCRateLimit)$" -count=1
go test ./handler -run "Test(OIDC|RateLimit|AuthAllow|WSAllow)" -count=5 -shuffle=on

# Backend 全量
go test ./...

# Docker healthcheck 健全性
docker build --check -f Dockerfile .
docker build --check -f Dockerfile.runtime .

# Frontend focused webhook/store 回归
cd D:\Code\TokenDance\tokendance-chat\frontend
npm test -- --run src/stores/chatStore.test.ts src/components/GroupInfoPanel.test.tsx
npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium

# Frontend 类型检查
npx tsc --noEmit

# Frontend 构建与视觉复核
npm run build
# 用 Go backend 提供生产构建，然后：
npm run visual:acceptance

# 仓库 diff 卫生
cd D:\Code\TokenDance\tokendance-chat
git diff --check

# 安全泄露检查（必须无声才算通过；AGENTS.md 自身的示例为预期豁免）
git grep -n -E '\b(hk1|hk2|us1|us2|us3|gz1)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E ':(3221)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E 'password.*[0-9]{4,}|sk-[a-zA-Z0-9]{20,}' -- ':!.git' ':!node_modules' ':!AGENTS.md'
```

## 工程规则

- 搜索先用 `rg`；仅在需要时回退到 PowerShell。
- 使用 `apply_patch` 进行手动编辑。
- 不要 revert 用户或不相关的变更。
- 不要 stage 或 commit 无关临时文件如 `tmp_*`。
- 优先小步验证增量，避免大面积重写。
- 行为变更时，先补 focused tests 再或同步实现。
- 当 protocol、security、deployment 或 AgentHub validation 行为变更时，保持文档同步。

## 前端规则

- 保留现有 React 19 + Zustand + Tailwind 模式。
- Chat UI 应克制、偏工作氛围如飞书/Lark，消息流动流畅如 Telegram。
- Light mode 是主要美学验收目标；dark mode 必须保持可用但不主导首轮复核。
- 控件图标优先使用 `lucide-react`。
- 核心应用界面不使用营销风格落地页或装饰性卡片。
- 控件和面板内保留文本；实际测试窄宽下的密集 UI。
- 声称有意义的 UI 打磨完成前，必须用 `docs/visual-acceptance.md` 的 screenshot metrics 验证；真实截图是 UI 打磨验收的硬性要求。
- `gpt-image-2` mockup 可作为布局、图标、密度、层级的艺术方向参考，但验收仍需真实浏览器截图。
- 安全敏感 UI（如 webhook secret）保持一次性 secret 与常规持久化状态分离。
- 滚动容器工程约束：flex-1 子元素需要 overflow-y-auto 滚动时，其父容器必须是 flex 容器（`display: flex`），否则高度约束断裂。Tailwind 等价为父容器加 `flex`，子容器 `flex-1 overflow-y-auto` 方可工作。

### i18n 规则（2026-05-24 更新）

- 用户可见字符串**必须**通过 `t()` 解析，禁止内联双语三元 `lang === "zh-CN" ? "..." : "..."`。
- 工具函数（formatTime/formatDate/formatLastSeen）接受 `t` 函数参数而非 `lang` 字符串。
- 新增 i18n key 必须在 `TranslationDict` interface、zh-CN、en-US 三处同步添加。
- 跨产品身份、Relay、Feishu/Lark、错误/配额和公开产品定位文案必须对照 `..\docs\i18n-parity-matrix.md`，不能只补一种语言。
- 交叉审查时运行 i18n-scan skill 检测硬编码字符串和缺失 key。

### WebSocket connect 规则（2026-05-24 更新）

- `connect()` 方法使用 `connectGeneration` 计数器跟踪连接代数。
- 所有异步 handler（onopen/onclose/onerror/onmessage/timeout）必须以 `if (gen !== this.connectGeneration) return;` 守卫，防止旧 socket 事件污染新连接状态。
- `disconnect()` 递增 generation 使旧 onclose 被忽略。
- `kicked` 事件后清空 `reconnectUsername` 防止 ping-pong 重连循环。

### Service Worker 规则（2026-05-25 更新）

- Static assets 使用 **stale-while-revalidate** 策略（非 cache-first），确保部署后浏览器自动拉取新资源。
- `/api/*` 与 `/ws` 绝不进入 Cache Storage；API GET 必须 network-only，WebSocket upgrade 不由 SW 处理。
- `CACHE_NAME` 每次 SW 行为变更时递增；当前 API network-only 基线为 `tdchat-v5`。
- `self.clients.claim()` 必须在 `event.waitUntil()` 内调用。
- 部署后验证：`curl -s https://<host>/ | grep -o 'index-[^"]*\\.js'` 确认 hash 匹配，并在浏览器 DevTools Cache Storage 中确认不存在 `/api/*` 条目。

### 移动端规则（2026-05-24 更新）

- 工具栏按钮默认在所有视口尺寸可见（`flex` + `sm:flex`，不用 `hidden sm:flex`）。
- 工具栏使用 `overflow-x-auto` 处理窄屏滚动，无需隐藏按钮。

## 后端规则

- 将 WebSocket message type 视为 API contract。
- 当持久化状态变更时，保持 store 行为显式且有测试覆盖。
- 不在 list 响应或宽泛 DTO 中暴露 secret。
- 不向前端暴露对象存储凭证或直连 bucket URL；保持同源 `/uploads/...` 路由。
- 群组/管理员操作优先在 handler 边界做角色检查。
- Webhook secret 必须以 versioned salted HMAC hash 存储，并用 constant-time comparison 验证。

## 安全与运维边界

### 红线（违反即事故）

以下内容**绝对禁止**出现在仓库的任何文件、commit message、branch name 或 PR 描述中：

| 禁止项 | 示例（均为反例） |
|--------|------------------|
| SSH alias / 服务器昵称 | `hk1`、`hk2`、`us1`、`gz1`、`prod-box` |
| 内部 IP / 端口 | `10.0.0.50`、`192.168.1.100`、`:3221` |
| 容器名 / 实例名 | 任何非项目名的 Docker 容器名或 K8s 实例名 |
| 真实 hostname | `chat.vectorcontrol.tech`（仅在 README "Live" 链接和 RELEASE E2E 命令中豁免） |
| 数据路径 | `/app/data`（Dockerfile 内可保留，但不得出现在公开文档中描述为生产路径） |
| 密码 / 凭据 / API key | `123456`、`sk-xxx`、`Bearer xxx`、任何 secret 的实际值 |
| 部署日志 | `docker run` 的实际输出、`scp` 的源/目标路径 |

违反后必须：当前文件脱敏 + `git filter-branch` 重写历史 + force push。

### 提交前自检

```powershell
# 在项目根目录跑，有输出就是有泄露（AGENTS.md 自身的示例为预期豁免）
git grep -n -E '\b(hk1|hk2|us1|us2|us3|gz1)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E ':(3221)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E 'password.*[0-9]{4,}|sk-[a-zA-Z0-9]{20,}' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git log --oneline --all --grep='hk1|hk2|3221'
```

### 公开文档规则

- 公开文档可描述部署形态和验证命令，不描述私有基础设施细节。
- 部署示例使用占位符：`user@server`、`chat.example.com`、`:3000`（示例端口）。
- `SECURITY.md` 跟踪安全态势；安全敏感行为变更时保持更新。
- CHANGELOG 不得包含真实用户名或密码。

## AgentHub 映射

| TokenDanceChat 模块 | AgentHub 目标 | 成熟度 |
|---|---|---|
| `backend/hub/` typed event handlers | Hub Server event contract | Demo 验证通过 |
| `backend/store/` SQLite 持久化 | Hub Server 持久化模式 | Demo 验证通过 |
| `frontend/src/lib/api.ts` 和 `useWebSocket` | 共享 realtime client helpers | Demo 验证通过 |
| 群组角色、webhook、通话 | IM 协作原语 | 验证中 |
| `MediaStore` local/WebDAV/S3 抽象 | Hub 媒体部署原语 | 验证中 |
| TokenBot/PicoClaw 界面 | Agent-as-contact UX | 验证中 |

当某个功能证明是可复用原语时，将经验记录到 `docs/agenthub-validation.md` 或专门的 `docs/` 文件。

## 开发工作流（dev-loop）

长程多步骤开发使用 `/dev-loop` 启动。短任务（单文件修复、typo）直接做。

### 模型分配策略

| 别名 | 模型 | 上下文 | 用途 |
|------|------|--------|------|
| haiku | glm-5.1 | 200k | 编码实现、bug 修复、算法——优先使用 |
| opus | deepseek-v4-pro | 1M | 推理、架构、审查——复杂决策 |
| sonnet | deepseek-v4-flash | 1M | 机械工作——ESLint、格式化、批量重命名 |

### 分支策略

- `master` 稳定，`dev` 开发
- 小范围 commit（每完成一个独立改动就提交），及时 push
- 不用 `--force`、`--no-verify`

### 标准循环

1. 读 ROADMAP → 选 1-3 个最高价值任务
2. 派 subagent（优先 haiku 编码，sonnet 机械工作，opus 审查）
3. 审查 subagent 输出，修复高优先级项
4. 运行 `neat-freak` 同步文档
5. Commit + push

### 审查门

提交有意义的变更前：
- `git diff --check`
- `cd backend && go test ./...`
- `cd frontend && npx tsc --noEmit && npm test -- --run`
- `npx eslint .`（0 errors 必须）
- 安全泄露检查（3 条 grep）
- 涉及文件的 focused 测试
- CI workflow 自动在 push/PR 到 dev 和 master 时运行上述检查（`.github/workflows/ci.yml`）

### 项目级 Skill

可复用 SOP 沉淀到 `.agents/skills/` 目录（不含本机路径、凭据、IP）。共 5 个活跃 skill + 使用指南：

- `verify` -- 提交前验证门禁（quick/full/security/E2E）
- `pm-audit` -- PM UX 审计 SOP（file checklist, UX dimensions, competitor comparison, priority framework）
- `deploy` -- 部署 SOP（Docker cp/build, systemctl, health check, rollback）
- `cross-review` -- 代码交叉审查 SOP（8 维检查清单, file groups, 常见 bug 模式, 严重度分类, 输出格式）
- `i18n-scan` -- i18n 扫描 SOP（键值校验、未翻译检测、硬编码字符串发现）

详见 `.agents/skills/README.md`。
