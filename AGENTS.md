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

Kick-off 机制 + 登录限流 + 挤下线 —— 已完成部署（v0.2.7），18/18 E2E 全绿。

此增量包含：
- 同名用户在新标签页登录时自动踢掉旧连接，发送 "kicked" 消息。
- `/api/login` 和 `/api/register` 独立 auth rate limiter（5 次/分钟/IP）。
- LoginScreen / RegisterScreen `autocomplete` 属性适配密码管理器。
- hub 注册通道原子化处理重复用户名（移除 `handleJoin` 中的 `IsUsernameTaken` 预检查）。

## 近期增量（v0.2.6）

密码哈希升级 + CORS 加固 + PicoClaw 修复 + 全面测试覆盖。
- 密码从 SHA-256 升级为 bcrypt cost 12，登录时自动迁移旧哈希。
- CORS 从通配符 `*` 改为 origin-aware（`CHAT_ALLOWED_ORIGINS` 环境变量驱动）。
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
- 安全泄露检查（3 条 grep）
- 涉及文件的 focused 测试

### 项目级 Skill

可复用 SOP 沉淀到 `.claude/skills/` 目录（不含本机路径、凭据、IP）。已有：
- `dev-loop` — 自主开发推进引擎
