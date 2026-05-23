# TokenDanceChat Agent 指南

最后更新：2026-05-23

## 项目定位

TokenDanceChat 是 AgentHub 的技术验证项目和可玩 Demo。

它通过真实聊天产品界面验证 AgentHub 的 Hub/IM 技术栈：

- Go Hub Server，typed WebSocket events。
- SQLite/FTS5 持久化（早期 Hub state）。
- React 19 + Zustand + Vite 客户端状态与 UI。
- Agent-as-contact UX：TokenBot、PicoClaw、mentions、DM、群组协作、流式回复。

本仓库不应演化为独立长期产品架构。可复用的经验应回流到 `D:\Code\AgentHub`。

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

Webhook 静态安全、媒体存储、screenshot 驱动的 UI 验收是本 worktree 已完成的工作切片：

- Webhook secret 以高熵一次性值生成，在 SQLite 中以 versioned salted HMAC hash 存储，通过 constant-time comparison 验证。
- 旧版明文 webhook 行在 store 启动时迁移为 hash。
- HTTP webhook ingress 通过 `store.VerifyWebhookSecret` 验证；list 响应对 owner/admin 受限且脱敏。
- `webhook_rotate` 立即使旧 secret 失效，写入 append-only audit log 行（created/rotated/deleted），向调用者返回一次性新 secret。
- `webhook_audit_list` 按群组返回脱敏审计事件；audit log 行通过 DTO 绝不包含 secret hash 或 metadata。
- `MediaStore` 支持本地磁盘、WebDAV 和 S3-compatible 存储。
- S3-compatible 媒体配置由 env 驱动，production-server 部署形态优先使用。
- 普通上传和自定义 emoji 均使用 safe media key 和同源 `/uploads/...` 路由。
- Docker runtime 镜像内置同容器 `/api/health` HEALTHCHECK，跟随 `CHAT_ADDR`（包括 `:3000` 等非默认监听地址）。
- 前端默认 light mode，飞书/Lark 风格的第一印象。
- 移动端 composer 保持 textarea 可用，Markdown 工具栏收起为图标。
- 移动端辅助聊天操作收入更多菜单，确保「公共聊天」可读。
- 消息记录密度已针对移动端/平板收紧，包括移除非本人消息的底部重复时间戳。
- 每条消息的 hover 操作合并为单个 44px 操作菜单；copy、forward、translate、react、pin、edit、delete、select 均从菜单可用。
- Header 操作、格式控件、定时消息入口、侧栏工具按钮、可点击头像均在 screenshot pass 中达到 44px 视觉验收目标。
- 桌面 sidebar 密度已收紧：4 张 model preview card，紧凑空状态，online-user 区首屏可见。
- 核心聊天界面视觉重量已降低：message bubble 使用更轻的边框，composer 工具按钮更轻，展开的 Markdown 工具栏更克制，可点击头像使用 46px 安全底板避免像素取整失败。
- 群组信息/管理界面现已纳入视觉验收：脚本创建真实群组、打开右侧面板、验证仅 owner 可见的 Webhook 区，以 44px 目标对面板控件做硬门槛。
- 前端 `group_info` 处理读取后端 `group_members` role payload，owner/admin 角色在真实 WebSocket round trip 后正确驱动群组信息和 Webhook 管理。
- group-info 截图门槛现在也检查桌面标题单行稳定性和群组首屏空状态可见，此系人工截图复核发现 header 挤压和空群内容稀疏后补充。
- 浏览器 E2E 现已覆盖完整的 Webhook ingress 闭环：群组管理员通过 UI 创建一次性 webhook，对生成的 URL 发送 HTTP POST，在群聊记录中可见外部消息。
- 视觉验收由 `npm run visual:acceptance`、真实浏览器 screenshot、metrics 和美学复核支撑。
- 生成的 `gpt-image-2` 参考图可作为美术方向参考，但不能替代真实浏览器截图作为验收依据。
- 当前已通过验收的干净 DB screenshot pass：`C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-23T04-02-23-020Z`。
- 平板和移动端使用紧凑顶栏直到 `lg` 断点；768px 不得被强制纳入桌面 sidebar/header 布局。

剩余跟进项：

- 群组视频通话多浏览器 smoke/E2E。

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
cd D:\Code\Projects\TokenDanceChat
.\scripts\verify.ps1
# Backend focused webhook 回归
cd D:\Code\Projects\TokenDanceChat\backend
go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin|AuditListRedactsMetadataAndRequiresGroupAdmin)"
go test ./store -run "Test(CreateWebhookDoesNotPersistPlaintextSecret|WebhookPlaintextSecretMigrationHashesExistingRows|RotateWebhookSecretInvalidatesOldSecretAndAudits)"
go test ./handler -run TestWebhookHandlerVerifiesHashedSecret

# Backend focused media 回归
go test ./handler -run "Test(UploadEmojiStoresViaMediaStore|ServeEmojiReadsViaMediaStore|S3MediaStoreSaveAndOpen|MediaStoreRejectsTraversalKeys)"

# Backend 全量
go test ./...

# Docker healthcheck 健全性
docker build --check -f Dockerfile .
docker build --check -f Dockerfile.runtime .

# Frontend focused webhook/store 回归
cd D:\Code\Projects\TokenDanceChat\frontend
npm test -- --run src/stores/chatStore.test.ts src/components/GroupInfoPanel.test.tsx
npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium

# Frontend 类型检查
npx tsc --noEmit

# Frontend 构建与视觉复核
npm run build
# 用 Go backend 提供生产构建，然后：
npm run visual:acceptance

# 仓库 diff 卫生
cd D:\Code\Projects\TokenDanceChat
git diff --check
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

## 后端规则

- 将 WebSocket message type 视为 API contract。
- 当持久化状态变更时，保持 store 行为显式且有测试覆盖。
- 不在 list 响应或宽泛 DTO 中暴露 secret。
- 不向前端暴露对象存储凭证或直连 bucket URL；保持同源 `/uploads/...` 路由。
- 群组/管理员操作优先在 handler 边界做角色检查。
- Webhook secret 必须以 versioned salted HMAC hash 存储，并用 constant-time comparison 验证。

## 安全与运维边界

- 不得 commit 生产环境 hostname、IP、SSH alias、容器名、内部端口、实际数据路径、凭证、API key 或部署日志。
- 公开文档可描述部署形态和验证命令，不描述私有基础设施细节。
- `SECURITY.md` 跟踪安全态势；安全敏感行为变更时保持更新。

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
