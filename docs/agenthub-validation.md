# AgentHub 验证笔记

TokenDanceChat 是 AgentHub 的验证项目与可玩 Demo。

它并非与 AgentHub 竞争的独立产品线。当前职责是在 AgentHub 主仓库 `D:\Code\AgentHub` 迁移或重新实现之前，先行验证轻量公共聊天室、Agent 入口、Hub realtime 协议、持久化以及 Web 客户端假设。早期 rich IM 能力保留为历史压力测试与后端兼容证据，不属于当前前端主合同。

## 项目存在理由

AgentHub 的目标产品是一个 IM 形态的多 Agent 协作平台：

```text
Desktop UI -> Edge Server -> Claude Code / Codex / OpenCode
                   ⇅
              Hub Server
```

TokenDanceChat 聚焦于该系统中聊天渲染、Agent 入口和 Hub 侧。它使用真实可操作的聊天界面验证难点，而非仅靠 mock 截图；当前主界面保持公共房间、TokenBot 和 PicoClaw 三个入口。

实践中，TokenDanceChat 同时扮演两个角色：

- AgentHub 聊天、realtime、存储及 Agent 交互栈的技术 spike；
- 在 AgentHub P0 Desktop/Edge 主线仍在构建期间，供人体验的可玩 Demo。

## 验证范围

| AgentHub 待验证问题 | TokenDanceChat 验证方式 |
|---|---|
| Hub 能否基于类型化 realtime 事件承载聊天流量？ | 当前前端只接公开房间、消息、reaction、编辑、线程和 Agent mention；后端仍保留旧 DM、群组、webhook、通话等协议兼容，用作迁移与安全回归证据。 |
| Go Hub Server 能否保持足够简洁以支持单二进制部署？ | 后端使用 `net/http`、`gorilla/websocket` 以及纯 Go 的 `modernc.org/sqlite`，无需 CGO 即可构建，作为单个 Linux 二进制部署。 |
| SQLite + FTS5 是否足以支撑早期 Hub 持久化？ | `backend/store` 持久化用户、公开消息、reactions、已读、线程、搜索以及历史 rich IM 兼容状态；当前 UI 只消费轻量公共聊天合同。 |
| React 客户端模型能否超越玩具聊天规模？ | `frontend/src` 使用 React 19、Vite、Tailwind、Zustand、懒加载面板、PWA 资源、移动端手势以及类型化 API helper，覆盖密集的聊天界面。 |
| Agent 能否像 IM 参与者一样自然？ | TokenBot 与 PicoClaw 通过公共协议 mention/前缀和轻量 assistant workbench 暴露给用户，不恢复真人私聊或复杂联系人系统；PicoClaw gateway 缺失时由 Hub 侧回退到 LLM，而不是向用户显示未配置错误。 |
| 外部系统能否安全进入 Hub 会话？ | webhook 曾用于验证外部入口、一次性高熵密钥、脱敏列表、加盐 HMAC 密钥哈希以及 constant-time HTTP 入口校验；当前前端主界面不暴露 webhook 管理。 |
| 类型化 Hub 角色数据能否驱动客户端管理员 UX？ | `group_info.group_members` 属于历史群组压力测试证据；当前主 UI 不展示群组管理员或 Webhook 控制项。 |
| Hub 媒体能否在不改变聊天界面的情况下外置存储？ | 普通上传已退休，`MediaStore` 不再作为有效 AgentHub spike；能力状态见 [docs/capability-matrix.md](./capability-matrix.md)。 |
| 哪些功能属于产品打磨，哪些是平台原语？ | 当前前端保留公共房间、TokenBot、PicoClaw、基础消息渲染、输入框、reaction、编辑、线程和搜索；聊天文件夹、通话房间、GIF/sticker、定时发送、转发和 webhook 管理归档为历史压力测试。 |

## 与 AgentHub 的关系

AgentHub 持有长期产品架构：

- Desktop Command Center：本地项目、线程、Agent 运行、diff、审批、预览。
- IM Collaboration：单聊、群组、@Agent、Orchestrator、Reviewer、多 Agent 流程。
- Hub Network：账号、联系人、群组、同步、中继、团队记忆。

TokenDanceChat 主要验证第二层与第三层。它不替代 AgentHub 的 Desktop/Edge 架构，也不应膨胀为第二份权威架构文档。

实用映射：

| TokenDanceChat 区域 | AgentHub 目标位置 |
|---|---|
| `backend/hub`、`backend/store` | `hub-server/` 概念与持久化模式 |
| `frontend/src/components`、`frontend/src/stores`、`frontend/src/lib/api.ts` | `app/web/` 与 `app/shared/` IM 客户端模式 |
| WebSocket 消息处理器 | `api/events.md` 风格的类型化事件思维 |
| `group_info.group_members` 角色标准化 | Hub 群组角色事件契约，用于 owner/admin UI 门控 |
| Agent 提及与 assistant workbench | AgentHub P1 IM Collaboration 实验 |
| Webhook 创建/列举/删除及哈希入口验证 | 历史 Hub 外部入口与群组管理员安全契约，当前不在前端主合同 |
| `MediaStore` local/WebDAV/S3 抽象 | 普通上传/emoji 媒体存储已退休，不再作为有效 spike；见 [docs/capability-matrix.md](./capability-matrix.md) |
| Docker/单二进制部署 | Hub 部署 spike，非完整 Desktop P0 流程 |

## 当前前端合同

主界面只保留：

- 公共聊天室；
- TokenBot；
- PicoClaw；
- compact assistant context strip、TokenBot/PicoClaw segmented switch 和 Ask 按钮；
- AgentHub v4 对齐的消息渲染、聊天区和输入框；
- 基础消息操作：回复、复制、编辑、删除、reaction、线程和搜索。

不要把联系人添加、真人私聊、群组、语音/视频、GIF picker、定时发送、转发、webhook 管理或 Open WebUI 的 `Knowledge` / `Tools` / `Prompts` 假工具芯片重新接回主界面，除非先更新 `ROADMAP.md` 并补足视觉/E2E 证据。

## 聊天 UI 源参考

当前聊天渲染、输入框和聊天区以 AgentHub v4 为主合同，Open WebUI 仅作为 AI chat 交互参考：

| 源 | 已迁移/对齐 | 明确不迁移 |
|---|---|---|
| AgentHub `app/shared/src/workbench/TranscriptView.tsx` | transcript region、ordered block list、date divider、keyboard/context-menu friendly block 结构。 | AgentHub Desktop 的工具调用、diff、approval、run-session 专用 block 不进入公共聊天室。 |
| AgentHub `app/shared/src/workbench/UnifiedComposer.tsx` | 单一 bottom composer、Enter 发送、受控 textarea、发送按钮反馈。 | Desktop 工作目录、审批模式、附件 picker 的本地 agent 专用语义。 |
| AgentHub shared `MessageBubble` | row/end alignment、meta/content/action 分离、loading/error 可达性思路。 | Desktop 运行日志和工具输出样式。 |
| Open WebUI `MessageInput.svelte` at latest checked HEAD `02dc3e689ceac915a870b373318b99c029ddf603` | bottom composer、Markdown 输入、发送中的 generating/submitting 反馈。 | 工具服务器、语音/通话、模型库、知识库、复杂队列、多会话侧栏和 Open WebUI 管理面。 |
| Open WebUI `Messages.svelte` / `Messages/Markdown.svelte` | AI chat 的消息流密度、Markdown-first 渲染和滚动恢复思路。 | WebUI 的多模型响应、citation/knowledge/tool 扩展面板。 |

2026-06-09 的 `ChatInput` submitting 状态就是按这个边界补齐：发送后按钮显示短暂 spinner 并阻止重复发送，但不增加旧 rich IM 功能。同日 AI workbench 也按这个边界收紧为 assistant context、TokenBot/PicoClaw segmented switch 和 Ask 按钮，明确不展示 Open WebUI 知识库、工具或 prompt 管理面。

## PicoClaw fallback 合同

PicoClaw 是当前轻量主界面的保留入口之一，但生产环境允许没有独立 PicoClaw gateway。Hub 侧合同是：

- 若 PicoClaw gateway client 可用，优先走 gateway；
- 若 gateway client 缺失但 LLM 已配置，PicoClaw 使用 LLM fallback 流式回复；
- 只有 gateway 与 LLM 都不可用时，才返回明确的不可用状态；
- TokenBot 与 PicoClaw 使用各自独立的 responding guard，避免一个 assistant 占用另一个入口。

2026-06-09 生产探针已验证 `notConfiguredAfterSend=false`，公网 PicoClaw mention 不再渲染 `PicoClaw is not configured on this server.`。

## 历史 Demo 边界

部分功能存在仅因 Demo 应有趣且可信：

- GIF/sticker/自定义 emoji；
- 视频与群组通话；
- PWA 离线壳；
- 聊天文件夹与归档/置顶会话打磨；
- 翻译与富文本消息操作。

这些是有用的压力测试，但不属于当前前端主合同。将思路回迁至 AgentHub 时，应优先选择已验证的原语：类型化事件、store 契约、会话状态、Agent 入口以及可恢复的 UI 状态。

## 如何使用本仓库

继续 TokenDanceChat 工作时，请同时牢记两个目标：

1. 保持其作为可用、可玩的聊天 Demo。
2. 记录哪些实现经验应反馈给 AgentHub。

若某变更仅是 Demo 打磨，请在文档或 changelog 中标注。若其验证了 AgentHub 原语，请记录映射关系，以便主仓库复用该经验。
