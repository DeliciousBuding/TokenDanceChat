# AgentHub 验证笔记

TokenDanceChat 是 AgentHub 的验证项目与可玩 Demo。

它并非与 AgentHub 竞争的独立产品线。其职责是在 AgentHub 主仓库 `D:\Code\AgentHub` 迁移或重新实现之前，先行验证 AgentHub IM、Hub、realtime 协议、持久化以及 Web 客户端假设。

## 项目存在理由

AgentHub 的目标产品是一个 IM 形态的多 Agent 协作平台：

```text
Desktop UI -> Edge Server -> Runner -> Claude Code / Codex / OpenCode
                   ⇅
              Hub Server
```

TokenDanceChat 聚焦于该系统中 IM 和 Hub 侧。它使用常规聊天产品界面，使团队可以在真实 UI 压力下验证难点，而非仅靠 mock 截图。

实践中，TokenDanceChat 同时扮演两个角色：

- AgentHub 聊天、realtime、存储及 Agent 交互栈的技术 spike；
- 在 AgentHub P0 Desktop/Edge/Runner 主线仍在构建期间，供人体验的可玩 Demo。

## 验证范围

| AgentHub 待验证问题 | TokenDanceChat 验证方式 |
|---|---|
| Hub 能否基于类型化 realtime 事件承载丰富 IM 流量？ | `backend/hub` 与 `frontend/src/lib/api.ts` 覆盖 40 余种 WebSocket 消息类型，涵盖公开聊天、DM、群组、reactions、通话、文件夹、日程、翻译等。 |
| Go Hub Server 能否保持足够简洁以支持单二进制部署？ | 后端使用 `net/http`、`gorilla/websocket` 以及纯 Go 的 `modernc.org/sqlite`，无需 CGO 即可构建，作为单个 Linux 二进制部署。 |
| SQLite + FTS5 是否足以支撑早期 Hub 持久化？ | `backend/store` 持久化用户、消息、群组、DM、reactions、已读、文件夹、自定义 emoji、通话历史及搜索。 |
| React 客户端模型能否超越玩具聊天规模？ | `frontend/src` 使用 React 19、Vite、Tailwind、Zustand、懒加载面板、PWA 资源、移动端手势以及类型化 API helper，覆盖密集的聊天界面。 |
| Agent 能否像 IM 参与者一样自然？ | TokenBot 与 PicoClaw 通过 @提及、类 DM 入口、流式回复及模型/供应商 UI 暴露给用户。 |
| 外部系统能否安全进入 Hub 会话？ | 群组 webhook 验证群主/管理员控制事件、一次性高熵密钥、脱敏列表、加盐 HMAC 密钥哈希以及 constant-time HTTP 入口校验。 |
| 类型化 Hub 角色数据能否驱动客户端管理员 UX？ | `group_info.group_members` 在真实 WebSocket 往返后携带 owner/admin/member 角色，React 客户端在展示群组管理员与 Webhook 控制项之前标准化该数据。 |
| Hub 媒体能否在不改变聊天界面的情况下外置存储？ | `backend/handler` 保持同源 `/uploads/...` URL，同时在本地磁盘、WebDAV 与 S3 兼容对象存储之间切换，适配 production-server 式部署；前端永远不会收到 bucket URL 或存储凭据。 |
| 哪些功能属于产品打磨，哪些是平台原语？ | 聊天文件夹、通话房间、消息翻译、GIF、自定义 emoji、设置以及 PWA 行为，用于区分可复用的平台模式与仅用于 Demo 的打磨。 |

## 与 AgentHub 的关系

AgentHub 持有长期产品架构：

- Desktop Command Center：本地项目、线程、Agent 运行、diff、审批、预览。
- IM Collaboration：单聊、群组、@Agent、Orchestrator、Reviewer、多 Agent 流程。
- Hub Network：账号、联系人、群组、同步、中继、团队记忆。

TokenDanceChat 主要验证第二层与第三层。它不替代 AgentHub 的 Desktop/Edge/Runner 架构，也不应膨胀为第二份权威架构文档。

实用映射：

| TokenDanceChat 区域 | AgentHub 目标位置 |
|---|---|
| `backend/hub`、`backend/store` | `hub-server/` 概念与持久化模式 |
| `frontend/src/components`、`frontend/src/stores`、`frontend/src/lib/api.ts` | `app/web/` 与 `app/shared/` IM 客户端模式 |
| WebSocket 消息处理器 | `api/events.md` 风格的类型化事件思维 |
| `group_info.group_members` 角色标准化 | Hub 群组角色事件契约，用于 owner/admin UI 门控 |
| Agent 提及与 DM 界面 | AgentHub P1 IM Collaboration 实验 |
| Webhook 创建/列举/删除及哈希入口验证 | Hub 外部入口与群组管理员安全契约 |
| `MediaStore` local/WebDAV/S3 抽象 | Hub 部署与租户媒体存储 spike |
| Docker/单二进制部署 | Hub 部署 spike，非完整 Desktop P0 流程 |

## Demo 边界

部分功能存在仅因 Demo 应有趣且可信：

- GIF/sticker/自定义 emoji；
- 视频与群组通话；
- PWA 离线壳；
- 聊天文件夹与归档/置顶会话打磨；
- 翻译与富文本消息操作。

这些是有用的压力测试，但并非全部是 AgentHub P0 的即时需求。将思路回迁至 AgentHub 时，应优先选择已验证的原语：类型化事件、store 契约、会话状态、Agent 作为联系人的交互以及可恢复的 UI 状态。

## 如何使用本仓库

继续 TokenDanceChat 工作时，请同时牢记两个目标：

1. 保持其作为可用、可玩的聊天 Demo。
2. 记录哪些实现经验应反馈给 AgentHub。

若某变更仅是 Demo 打磨，请在文档或 changelog 中标注。若其验证了 AgentHub 原语，请记录映射关系，以便主仓库复用该经验。
