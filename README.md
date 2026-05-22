# TokenDanceChat

> 实时多人聊天室 — Go + WebSocket + SQLite + React 19  
> Real-time chat with DMs, groups, AI bots, and PicoClaw Agent

[![Status](https://img.shields.io/badge/status-active-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF?logo=vite)](https://vite.dev/)

**Live**: [chat.vectorcontrol.tech](https://chat.vectorcontrol.tech)

---

## 功能 Features

### 核心聊天 Core Chat
- 公共聊天室 · 私信 (DM) · 群组聊天 · 多房间
- Markdown 消息渲染（代码高亮、表格、GFM）
- 图片粘贴/拖拽上传（WebDAV 存储）
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
- SQL 参数化查询 · FTS5 注入防护 · XSS 过滤
- WebSocket Origin 验证 · CSP 头
- 频率限制（WS + REST 双层级）
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
| LLM | Anthropic Messages API + OpenAI Chat Completions |
| 部署 Deploy | Docker · Nginx |

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

完整协议见 [docs/llm-api-reference.md](./docs/llm-api-reference.md)。

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

---

## 目录结构 Structure

```
TokenDanceChat/
├── backend/           # Go 后端
│   ├── handler/       # HTTP + WS handler
│   ├── hub/           # 聊天核心（client、room、broadcast）
│   ├── store/         # SQLite + FTS5
│   ├── llm/           # LLM adapter（Anthropic + OpenAI）
│   ├── picoclaw/      # PicoClaw Agent 客户端
│   └── main.go
├── frontend/          # React SPA
│   ├── src/
│   │   ├── components/   # UI 组件
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

生产部署文档见 [HANDOFF.md](./HANDOFF.md)（运维信息）和 [deploy.md](./deploy.md)（通用流程）。

---

## 文档索引 Docs

| 文档 | 内容 |
|------|------|
| [ROADMAP.md](./ROADMAP.md) | 路线图与版本规划 |
| [HANDOFF.md](./HANDOFF.md) | 生产运维交接（服务器、部署、故障记录） |
| [deploy.md](./deploy.md) | 通用部署流程 |
| [SECURITY.md](./SECURITY.md) | 安全审计报告 |
| [CHANGELOG.md](./CHANGELOG.md) | 变更日志 |
| [docs/research-deeix-lobehub.md](./docs/research-deeix-lobehub.md) | DEEIX-Chat + LobeHub Icons 调研 |
| [docs/llm-api-reference.md](./docs/llm-api-reference.md) | LLM API 参考 |

---

## License

[MIT](./LICENSE)
