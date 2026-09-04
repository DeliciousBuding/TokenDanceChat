# TokenDanceChat — 项目 Agent 交接 SSOT

> 本文件是项目级 Agent 交接的唯一事实来源（SSOT）：接手 TokenDanceChat 的 agent 先读本文件。
> 运行时 bot system prompt 由后端启动时生成到 `data/AGENTS.md`（见 `backend/main.go` 的 `writeAgentsMD`），不要与本文件混淆，也不要引用本文件作为 bot 的系统提示词。

最后更新：2026-08-31

## 项目定位

TokenDanceChat 是 [AgentHub](https://github.com/TokenDanceLab/AgentHub) 的技术验证项目 + 轻量公共聊天室 Demo，公开开源仓 `github.com/TokenDanceLab/TokenDanceChat`。它不是独立的产品线，验证目标：

- Go Hub Server + WebSocket typed events 承载公共消息、presence、reactions、编辑、线程与 AI 流式回复；
- SQLite（modernc.org/sqlite，pure Go）+ FTS5 支撑早期 Hub 持久化与全文搜索；
- React 19 + Zustand + Vite 的客户端状态模型跑通轻量聊天工作台；
- 公共协议 mention 能否让 AI 以 IM 参与者的形态自然嵌入；
- TokenDance ID OIDC 作为统一身份入口接入 IM。

完整验证边界见 `docs/agenthub-validation.md`；能力状态与退役清单以 `docs/capability-matrix.md` 为唯一事实来源。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite 6 · Tailwind CSS 4 · Zustand 5 |
| 后端 | Go 1.25 · gorilla/websocket · net/http |
| 数据库 | SQLite（pure Go）+ FTS5 |
| 实时协议 | WebSocket typed events |
| LLM | Anthropic Messages API + OpenAI Chat Completions |
| 部署 | Docker · Nginx |

## 目录地图

```
backend/            # Go 后端
  handler/          # HTTP + WS handler + OIDC client + GET /api/config
  hub/              # 聊天核心（client / room / broadcast）
  store/            # SQLite + FTS5
  llm/              # LLM adapter（Anthropic + OpenAI）
  main.go           # 入口：配置读取、路由注册、writeAgentsMD
frontend/
  src/components/   # UI 组件（MessageTranscript / MessageBubble / ChatInput / Sidebar…）
  src/stores/       # Zustand 状态
  src/hooks/        # 自定义 Hooks
  src/lib/          # 工具 + API 客户端 + Registry
  src/i18n/         # 国际化
  public/           # 静态资源 + PWA（robots.txt / sitemap.xml / llms.txt）
docs/               # 文档（验证边界 / 能力矩阵 / 视觉验收 / 安全）
scripts/            # 构建/部署脚本
nginx/              # Nginx 配置
```

## 当前产品合同

收敛为**公共聊天室 + TokenBot 单 agent（双会话形态）**：

- 公共聊天室：消息渲染、编辑/删除/引用回复、reaction、搜索、线程、无限滚动、输入状态；`@TokenBot` mention 触发 bot 在房间内公开流式回复。
- 私人助手 1:1：侧边栏选 TokenBot 进入独立私聊视图；消息 `to=BotName` 走私聊通道（后端不广播、只回发起者，`Message.Private`），历史经 `GET /api/messages?to=`（鉴权、按请求者作用域）加载。公共与私聊消息流互不可见。
- TokenBot：单 bot，LLM 流式回复；模型由服务端 `CHAT_LLM_MODEL` 配置，前端通过 `GET /api/config` 展示真实模型名，前端不假设模型列表。
- 其它历史 IM 能力（DM、群组、语音/视频、GIF、定时发送、转发、webhook 管理、普通文件上传、文件夹）已于 2026-08-31 从后端运行面删除（Archived）。若要恢复，必须先更新 `ROADMAP.md` 并补足视觉/E2E 证据。

## 验证命令

```bash
# 后端
cd backend && go build ./... && go test ./...

# 前端
cd frontend && npx tsc --noEmit && npm test && npm run build
```

提交前再跑 `git diff --check`。每次有意义的前端打磨须用真实浏览器截图验收（视觉验收流程见 `docs/visual-acceptance.md`）。

## 已知坑（改前必读）

- **arm64 宿主禁止 `platform: linux/amd64`**：qemu/binfmt 模拟层已退役，写死 amd64 必然 `exec format error`（曾导致容器崩溃循环 + 公网 502）。构建或拉取 arm64 产物，部署前断言架构（`file` 对比 `uname -m`）。
- **Service Worker 缓存**：返回用户会跑旧包——「UI 没生效」先查 `CACHE_NAME` 是否 bump；导航请求必须 network-first。
- **`git commit -m` 含反引号**会触发 shell 命令替换、截断提交信息；提交信息用单引号或写进文件（`-F`）。
- **`go run .` 后台易失 + 旧进程占端口**：用 `netstat -ano` 找真占用者再 `taskkill`，不要盲目换端口。
- **Go 单发 channel 给已断开客户端会 panic**（send on closed channel）——发送前在锁内校验成员集。
- **Playwright `isVisible()` 对 `translate-x` 离屏元素误报 true**：断言用 `boundingBox()`。
- 部署宿主上普通用户可能无 `docker.sock` 权限 → `sudo -n docker ...`；本机缺 `sqlite3` 客户端时，用挂载 db 文件的 alpine 容器跑查询。

## 安全约定

- secret 不进仓：`.env*`、`.env.local` 均被 `.gitignore` 忽略，示例值只在 `.env.example`。
- 公开文档不出现服务器 IP、内部端口、SSH、凭据或生产数据。
- 敏感配置一律走环境变量；`CHAT_SESSION_SECRET`、`CHAT_LLM_API_KEY`、OIDC client secret 必须在部署环境提供。

## 文档习惯

- 相对时间写绝对日期；文档引用 AGENTS 规则时写主题名或文件路径，不写编号式引用。
- 完成一个里程碑后请运行 `neat-freak` 知识卫生收口。
