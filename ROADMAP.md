# TokenDanceChat ROADMAP

最后更新：2026-08-30

发布: [v0.2.13](https://github.com/TokenDanceLab/TokenDanceChat/releases/tag/v0.2.13) | Docker: `tokendancechat:v0.2.13` | 测试: **690** 前端 / 35 文件 / Backend **6/6** / Skills **6** 活跃 / CI 全绿 | OIDC + session auth

## 当前目标

TokenDanceChat 是 AgentHub Hub/IM 验证项目兼可玩 Demo。

当前产品目标是用轻量聊天原型验证 AgentHub 的 realtime Hub、SQLite 持久化、React 客户端状态、公共聊天室 + Agent-as-contact UX 和部署形态，同时将 Demo 向以下方向演进：

- 公共聊天室优先，保留 TokenBot 单 agent 入口；
- Telegram 级别的消息流动、对话人体工学、移动端交互质量；
- 安全、可测试、可部署的工程基线，能将经验回流到 `D:\Code\AgentHub`。

`ROADMAP.md` 是面向未来 agent 的持久化目标账本。每次有意义的实现、验证、安全复核或范围决策后更新。

## 产品原则

1. **AgentHub first**
   TokenDanceChat 验证 AgentHub 的 IM 协作和 Hub 网络层。不得演化为独立的长期产品架构。

2. **轻量 Demo**
   应用应保持干净、可用和高效：主产品面只保留公共聊天室、TokenBot 单 agent。复杂联系人添加、联系人私聊、群组、语音/视频通话、GIF picker、定时发送、webhook 管理、普通文件上传等旧 IM 压力测试能力已退休，不再进入主界面合同；后端残留路由/事件属「运行面清理中」（后续 PR 删除）。能力状态与退役清单以 [docs/capability-matrix.md](./docs/capability-matrix.md) 为唯一事实来源。

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
| P1 | 轻量聊天 UX | 公共消息流、threads、reactions、通知、搜索、移动端人体工学和 AI 工作区切换；能力状态与退役清单见 [docs/capability-matrix.md](./docs/capability-matrix.md)。 |
| P1 | Telegram UX | 快速消息列表、干净输入、移动端手势、copy/reply/edit 人体工学、打磨过渡、媒体查看器质量。 |
| P1 | Agent-as-contact | 让 TokenBot 感觉像轻量 AI 私聊入口：通过公共协议 mention/前缀发送，保留模型/provider 可供性，不恢复真人私聊或复杂联系人系统。 |
| P2 | 运维/性能 | Health check、部署 checklist、bundle/runtime profiling、虚拟列表调优、WebSocket fanout/load check。 |
| P2 | OIDC / 会话鉴权 | TokenDance ID 统一登录：`CHAT_OIDC_ENABLED` 控制；本地/OIDC 登录签发应用 `session_token`，保护 REST 与注册用户 WS join。 |
| P2 | UI/美术方向 | 克制企业 UI + 流畅聊天交互；避免装饰性营销布局。 |

## 后续产品任务

1. 继续收紧公共房间、TokenBot 单 agent 的消息渲染、流式回复、搜索、reaction、thread 和移动端输入体验。
2. 保持 AgentHub v4/OpenWebUI 风格的 transcript、message block、composer 和 assistant workbench 对齐，新增 UI 必须先补 token/视觉验收。
3. 性能 pass：消息列表 profiling、bundle/chunk review、WebSocket fanout/load check。
4. 后端历史 rich IM 协议只做兼容、安全回归和迁移证据维护；不要把群组、真人 DM、通话、GIF、定时、转发或 webhook 管理重新接回主界面。

## Review Gates

提交或交接有意义的变更前：

- [x] `git diff --check`
- [x] `cd backend && go test ./...`
- [x] `cd frontend && npx tsc --noEmit`
- [x] 涉及文件的 Focused 前后端测试
- [x] 文档更新（protocol、security、用户可见行为和 AgentHub validation 笔记）
- [x] `tmp_*` 或无关本地文件不暂存

## 已完成基线

- 历史核心聊天快照：公共房间、DM、群组、好友、reactions、在线状态、typing。当前前端主合同只保留公共房间、TokenBot 单 agent。
- 历史数据完整性快照：SQLite 持久化、离线 DM、历史 reactions、消息上限、作用域 typing。当前 UI 只消费公开房间与基础消息状态。
- 当前 IM 打磨：未读角标、草稿、滚动记忆、搜索跳转、流式节流、中文 mentions、CSP/XSS 加固；转发、群组、通话、GIF/sticker、webhook 管理不再进入主界面。
- 高级功能：已读回执、最后在线、@mention 通知、通知声音、屏蔽。
- 进阶历史 IM：置顶/书签、群组邀请流程、threaded replies、范围搜索、无限历史、typing 预览、自定义 emoji。当前只保留能服务轻量公共聊天室的子集。
- 平台：PWA shell、前端单元测试、后端 WebSocket/store 测试、无障碍基线、Bot/Agent mention 路由。
- 2026-08-30：收敛为 TokenBot 单 agent（旧第二 Agent 工作区入口移除）；配置链修复——后端启动自动加载 `.env.local` 再 `.env`（OS 环境变量优先，文件只补缺）、`docker-compose.yml` 补传 `CHAT_LLM_*`、新增 `GET /api/config`；UIUX 修复包——设置抽屉背景改实、移动端 composer 修复、删除 composer 假「+」按钮、桌面/移动端明暗主题修复。
