# TokenDanceChat

> 轻量级实时公共聊天室 —— Go + WebSocket + SQLite 演示项目
> Lightweight real-time public chat — Go + WebSocket + SQLite demo

[![Demo](https://img.shields.io/badge/status-Demo-orange)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Go](https://img.shields.io/badge/Go-1.24-00ADD8?logo=go)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)

---

## Screenshot / 截图

> A dark-themed public chatroom UI inspired by Kanna. Users join with a nickname, see online users, and exchange real-time messages with Markdown support.
> 
> Kanna 风格的暗色主题公共聊天室界面。用户输入昵称即可加入，查看在线用户列表，并实时收发支持 Markdown 的消息。

*(Screenshot placeholder — add a screenshot here)*

---

## Quick Start / 快速开始

```bash
# 1. Start the backend / 启动后端
cd backend && go run .
# → http://localhost:8080

# 2. Start the frontend / 启动前端
cd frontend && npm install && npm run dev
# → http://localhost:5173

# 3. (Optional) Single-binary build / 单二进制编译
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o tokendancechat .
```

---

## Stack / 技术栈

| Layer 层 | Tech 技术 |
|-----------|------------|
| Frontend 前端 | React 19 · Vite · Tailwind CSS 4 · zustand |
| Backend 后端 | Go 1.24 · gorilla/websocket |
| Database 数据库 | SQLite (modernc.org/sqlite, pure Go) |
| Deploy 部署 | Single binary · Docker · Nginx |

---

## Features / 功能

- [x] Public chat with WebSocket real-time messaging / WebSocket 实时公共聊天
- [x] Nickname-based join (no registration) / 昵称加入（无需注册）
- [x] Online user list / 在线用户列表
- [x] Message history with pagination / 消息历史与分页
- [x] Markdown rendering in messages / 消息支持 Markdown 渲染
- [x] Dark theme (Kanna-inspired) / 暗色主题（Kanna 风格）
- [x] i18n: Chinese / English / 中英文双语界面
- [x] SQLite persistence / SQLite 持久化
- [x] Rate limiting / 消息频率限制

---

## API Reference / API 参考

| Endpoint | Description 描述 |
|----------|-------------------|
| `GET /api/health` | Health check / 健康检查 |
| `GET /api/messages?limit=100&before=ts` | Message history / 消息历史 |
| `GET /api/users/online` | Online user list / 在线用户列表 |
| `GET /ws` | WebSocket endpoint / WebSocket 端点 |

### WebSocket Protocol / 协议

```json
// Join / 加入
→ {"type":"join","username":"alice"}
← {"type":"history","messages":[...]}
← {"type":"user_joined","username":"alice","online":[...]}

// Chat / 聊天
→ {"type":"message","content":"hello"}
← {"type":"message","id":"...","username":"alice","content":"hello","timestamp":...}

// Leave / 离开
← {"type":"user_left","username":"alice","online":[...]}
```

---

## Config / 配置

| Env | Default | Description 描述 |
|-----|---------|-------------------|
| `CHAT_ADDR` | `:8080` | Listen address / 监听地址 |
| `CHAT_DB_PATH` | `data/chat.db` | SQLite path / 数据库路径 |
| `CHAT_FRONTEND_DIR` | `frontend/dist` | Static files dir / 静态文件目录 |

Copy `.env.example` to `.env` and adjust as needed / 复制 `.env.example` 为 `.env` 并按需修改。

---

## Deploy / 部署

See [DEPLOY.md](./deploy.md) for Docker + Nginx instructions.

详见 [DEPLOY.md](./deploy.md) 了解 Docker + Nginx 部署说明。

---

> **Disclaimer / 免责声明**: This is a **demo project** built for learning and demonstration purposes. It is not intended for production use. Authentication, moderation, and advanced security features are not implemented.
> 
> 这是一个**演示项目**，用于学习和展示目的，不适用于生产环境。未实现身份验证、内容审核及高级安全功能。

## License / 许可证

[MIT](./LICENSE)
