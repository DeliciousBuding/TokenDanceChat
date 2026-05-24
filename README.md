# TokenDanceChat

> AgentHub 技术栈验证项目 + 可玩 Demo
> A playable IM demo for validating AgentHub's Hub, realtime, persistence, Agent interaction, and React client stack

[![Status](https://img.shields.io/badge/status-active-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF?logo=vite)](https://vite.dev/)

**Live**: [chat.vectorcontrol.tech](https://chat.vectorcontrol.tech)

---

## Public Packaging

TokenDanceChat is packaged as both a playable chat demo and the AgentHub IM proving ground. Public entry files live in `frontend/public/robots.txt`, `frontend/public/sitemap.xml`, and `frontend/public/llms.txt`; update them with README/site metadata when routes, product wording, PWA behavior, or TokenDance ID login semantics change.

The frontend already exposes PWA and zh/en i18n surfaces. New shared UI work should use the `--td-*` compatibility aliases in `frontend/src/index.css` where possible, while preserving the chat-specific macOS blue accent until visual QA says otherwise.

---

## 项目定位 Positioning

TokenDanceChat 是 [AgentHub](https://github.com/TokenDanceLab/AgentHub) 的技术验证项目，不是独立于 AgentHub 的长期产品线。

AgentHub 的目标是 IM 形态的多 Agent 协作平台：用户像在飞书/微信里拉群一样组织 Claude Code、Codex、OpenCode、Reviewer、Orchestrator 等 Agent 协作。TokenDanceChat 先把其中的 Hub/IM 侧做成一个真实可玩的聊天 Demo，用来验证：

- Go Hub Server + WebSocket typed events 是否能承载丰富 IM 协议；
- SQLite + FTS5 是否足够支撑早期 Hub 持久化和搜索；
- React 19 + Zustand + Vite 的客户端状态模型能否跑通复杂聊天工作台；
- Agent 是否能以联系人、群成员、@mention、DM 和流式回复的形态自然嵌入 IM；
- TokenDance ID OIDC 登录能否作为统一身份入口自然接入 IM Demo；
- 哪些能力是 AgentHub 可复用的平台原语，哪些只是为了 Demo 更好玩。

更完整的验证边界见 [docs/agenthub-validation.md](./docs/agenthub-validation.md)。

---

## 功能 Features

### 核心聊天 Core Chat
- 公共聊天室 · 私信 (DM) · 群组聊天 · 多房间
- Markdown 消息渲染（代码高亮、表格、GFM）
- 图片粘贴/拖拽上传（本地/WebDAV/S3-compatible 存储）
- 语音消息录制
- 文件分享（文档、压缩包）
- 消息编辑 · 删除 · 转发 · 引用回复
- 表情反应 (Emoji Reactions)
- 消息搜索（全文检索，FTS5）
- 无线滚动历史加载
- 输入状态指示（类似 Telegram typing preview）

### AI Bots & Agent
- **TokenBot** — @mention 触发 LLM 对话（流式 SSE）
- **PicoClaw** — Agent 工作流引擎（`@PicoClaw` 触发）
- 多模型支持：DeepSeek V4 Pro/Flash · GLM 5.1 · Qwen 3.6 Plus · Kimi K2.6 · MiniMax M2.7
- Anthropic Messages API + OpenAI Chat Completions 双协议
- Bot 对话记忆持久化
- LobeHub 厂商图标

### UI/UX
- 暗色/亮色/跟随系统主题
- 中英文双语 (i18n)
- PWA 离线支持（Service Worker）
- 桌面通知（@mention + 新消息）
- 移动端适配（触屏手势、键盘处理）
- 无障碍 (a11y)：屏幕阅读器、键盘导航

### 安全 Security
- 密码：bcrypt (cost 12) 哈希，SHA-256 旧哈希登录时自动升级
- 可选 TokenDance ID OIDC 登录：Authorization Code + PKCE，ID Token 通过 JWKS/RS256 验证
- Auth 频率限制：login/register 5 次/分钟/IP
- CORS origin-aware（非通配符）+ WebSocket Origin 验证
- SQL 参数化查询 · FTS5 注入防护 · XSS 过滤
- CSP 头双层覆盖（前端 meta 标签 + 后端中间件）
- 会话挤下线：新登录自动踢出旧连接
- 路径穿越防护 · 消息大小限制
- 用户屏蔽 · 好友系统

---

## 快速开始 Quick Start

```bash
# 1. 后端 Backend
cd backend && go run .
# → http://localhost:8080

# 2. 前端 Frontend
cd frontend && npm install && npm run dev
# → http://localhost:5173

# 3. 单二进制构建 Single-binary build
cd backend
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o tokendancechat .
```

---

## 技术栈 Stack

| 层 Layer | 技术 Tech |
|----------|----------|
| 前端 Frontend | React 19 · Vite 6 · Tailwind CSS 4 · Zustand 5 |
| 后端 Backend | Go 1.25 · gorilla/websocket · net/http |
| 数据库 Database | SQLite (modernc.org/sqlite, pure Go) + FTS5 |
| 实时协议 Realtime | WebSocket typed events |
| LLM | Anthropic Messages API + OpenAI Chat Completions |
| 部署 Deploy | Docker · Nginx |

这些选择对应 AgentHub 主仓库的技术方向：React 19、Go、SQLite/FTS5、REST JSON API、WebSocket typed events，以及 Hub/IM/Agent 交互模型。TokenDanceChat 先在 Demo 中验证这些组合的工程可行性。

---

## WebSocket 协议 Protocol

```
→ {"type":"join","username":"alice"}
← {"type":"history","messages":[...]}
← {"type":"user_joined","username":"alice","online":[...]}

→ {"type":"message","content":"hello"}
← {"type":"message","id":"...","username":"alice","content":"hello","timestamp":...}

→ {"type":"dm","to":"bob","content":"hi"}
→ {"type":"group_message","group":"general","content":"hello"}
→ {"type":"forward","message_id":"...","to_username":"charlie"}
→ {"type":"reaction","message_id":"...","emoji":"👍"}
→ {"type":"edit","message_id":"...","content":"edited text"}
→ {"type":"friend_request","to":"bob"}
→ {"type":"block","username":"spammer"}
```

完整协议见 [docs/webhook-integration.md](./docs/webhook-integration.md)。

---

## 配置 Config

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CHAT_ADDR` | `:8080` | 监听地址 |
| `CHAT_DB_PATH` | `data/chat.db` | SQLite 路径 |
| `CHAT_FRONTEND_DIR` | `frontend/dist` | 前端静态文件 |
| `CHAT_LLM_BASE_URL` | — | LLM API 地址 |
| `CHAT_LLM_MODEL` | — | 模型名 |
| `CHAT_LLM_API_KEY` | — | API 密钥 |
| `CHAT_LLM_PROVIDER` | `openai` | LLM 协议 (openai / anthropic) |
| `CHAT_BOT_NAME` | `TokenBot` | Bot 名称 |
| `CHAT_AGENT_NAME` | `PicoClaw` | Agent 名称 |
| `CHAT_PICOCLAW_URL` | — | PicoClaw WebSocket 地址 |
| `CHAT_PICOCLAW_TOKEN` | — | PicoClaw 认证 Token |
| `CHAT_ALLOWED_ORIGINS` | — | 允许的 WebSocket 来源（逗号分隔） |
| `CHAT_SESSION_SECRET` | — | 应用 `session_token` HMAC 签名 secret；生产/共享环境必须稳定配置，否则重启后现有会话失效 |
| `CHAT_MEDIA_S3_ENDPOINT` | — | S3-compatible 媒体存储端点；配置后优先于 WebDAV |
| `CHAT_MEDIA_S3_REGION` | — | S3 签名 region，S3-compatible 服务可用 `auto` |
| `CHAT_MEDIA_S3_BUCKET` | — | 媒体对象 bucket |
| `CHAT_MEDIA_S3_ACCESS_KEY_ID` | — | 媒体对象存储 Access Key |
| `CHAT_MEDIA_S3_SECRET_ACCESS_KEY` | — | 媒体对象存储 Secret Key |
| `CHAT_MEDIA_S3_SESSION_TOKEN` | — | 可选临时凭证 token |
| `CHAT_MEDIA_S3_PREFIX` | `uploads` | 媒体对象前缀 |
| `CHAT_MEDIA_S3_FORCE_PATH_STYLE` | `false` | 是否使用 path-style bucket URL |
| `CHAT_MEDIA_WEBDAV_ENDPOINT` | — | WebDAV 媒体存储端点；仅在未配置 S3 时启用 |
| `CHAT_OIDC_ENABLED` | `false` | 是否启用 TokenDance ID 登录 |
| `CHAT_OIDC_ISSUER` | `https://id.vectorcontrol.tech` | OIDC issuer |
| `CHAT_OIDC_CLIENT_ID` | `tokendance-chat` | TokenDance ID OAuth client id |
| `CHAT_OIDC_REDIRECT_URI` | `http://localhost:8080/api/oidc/callback` | OIDC 回调地址，生产使用 `https://chat.vectorcontrol.tech/api/oidc/callback` |

---

## OIDC Relying-Party Checklist

TokenDanceChat 是服务端型 OIDC consumer；详细步骤见 [docs/oidc-setup.md](./docs/oidc-setup.md)，跨系统规则见 [../docs/identity-auth.md](../docs/identity-auth.md)。

| 项 | 当前实现 |
|----|----------|
| Callback | 本地 `http://localhost:8080/api/oidc/callback`；生产 `https://chat.vectorcontrol.tech/api/oidc/callback` |
| Token exchange | 后端 `/api/oidc/callback` 使用 Authorization Code + PKCE 兑换 token，并通过一次性 `oidc_rid` 交给前端 redeem |
| Token storage | 后端临时保存 redeem token 5 分钟；前端 OIDC access/refresh token 只放 Zustand 内存；应用 `session_token` 存入 `tokendance:sessionToken`，用于 REST Bearer 鉴权和本地注册用户 WS join |
| Refresh | `/api/oidc/refresh` 已实现并转发 TokenDance ID refresh flow；当前 UI 不持久化 refresh token，刷新页面后不会继续 OIDC token refresh |
| Logout | 当前 disconnect/logout 只清除本地聊天状态，不跳转 TokenDance ID `/logout` |
| Validation boundary | 受保护 REST 端点要求 `Authorization: Bearer <session_token>`；WebSocket join 中 OIDC 用户发送 OIDC access token，本地注册用户发送应用 `session_token`，游客不发送 token |

## 目录结构 Structure

```
TokenDanceChat/
├── backend/           # Go 后端
│   ├── handler/       # HTTP + WS handler
│   │   └── oidc.go    # TokenDance ID OIDC client integration
│   ├── hub/           # 聊天核心（client、room、broadcast）
│   ├── store/         # SQLite + FTS5
│   ├── llm/           # LLM adapter（Anthropic + OpenAI）
│   ├── picoclaw/      # PicoClaw Agent 客户端
│   └── main.go
├── frontend/          # React SPA
│   ├── src/
│   │   ├── components/   # UI 组件
│   │   │   ├── AuthModal.tsx
│   │   │   └── OidcLoginButton.tsx
│   │   ├── hooks/        # 自定义 Hooks
│   │   ├── stores/       # Zustand 状态
│   │   ├── i18n/         # 国际化
│   │   ├── lib/          # 工具 + API 客户端 + Registry
│   │   └── main.tsx
│   └── public/        # 静态资源 + Service Worker
├── docs/              # 文档
├── scripts/           # 构建/部署脚本
├── nginx/             # Nginx 配置
├── Dockerfile.runtime # 运行时镜像
├── docker-compose.yml
└── ROADMAP.md
```

---

## 部署 Deploy

通用部署流程见 [deploy.md](./deploy.md)。项目级 Agent 接手规则见 [AGENTS.md](./AGENTS.md)，持续目标和当前增量见 [ROADMAP.md](./ROADMAP.md)。

---

## TokenDance 系统上下文

在 `D:\Code\TokenDance` workspace 内做跨系统治理时，先看根级 `../AGENTS.md` 和 `../docs/`。TokenDanceChat 是 AgentHub 的 IM/Hub 技术验证项目；身份方向以 `../docs/identity-auth.md` 和 `../tokendance-id/docs/api.md` 为准，视觉方向以 `../docs/design-system.md` 为准。

---

## 文档索引 Docs

| 文档 | 内容 |
|------|------|
| `../docs/` | TokenDance 系统级架构、身份鉴权、设计系统、文档治理 |
| [docs/agenthub-validation.md](./docs/agenthub-validation.md) | AgentHub 验证项目定位、技术栈映射、Demo 边界 |
| [docs/engineering-goal.md](./docs/engineering-goal.md) | 长期工程目标、设计原则、验证要求 |
| [docs/webhook-integration.md](./docs/webhook-integration.md) | 群组传入 Webhook 协议、安全契约、验证命令 |
| [docs/visual-acceptance.md](./docs/visual-acceptance.md) | 前端截图、多模态审美和视觉验收标准 |
| [ROADMAP.md](./ROADMAP.md) | 持续目标账本、当前增量、验证记录 |
| [AGENTS.md](./AGENTS.md) | 项目级 Agent 接手规则、架构地图、验证命令 |
| [deploy.md](./deploy.md) | 通用部署流程 |
| [SECURITY.md](./SECURITY.md) | 安全审计报告 |
| [CHANGELOG.md](./CHANGELOG.md) | 变更日志 |
| [docs/research-deeix-lobehub.md](./docs/research-deeix-lobehub.md) | DEEIX-Chat + LobeHub Icons 调研 |
| [docs/llm-api-reference.md](./docs/llm-api-reference.md) | LLM API 参考 |

---

## License

[MIT](./LICENSE)
