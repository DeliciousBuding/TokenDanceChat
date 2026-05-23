# 工程目标

> 面向未来的 agent 与维护者：保持 TokenDanceChat 作为 AgentHub 验证项目与可玩 Demo 持续推进。每一项变更应当要么验证 AgentHub 平台原语，要么在不损害验证目标的前提下提升 Demo 质量，要么降低工程风险。

## 当前目标

将 TokenDanceChat 推进为 AgentHub 的 Hub/IM 验证面，同时保持其作为 Demo 可生产运行。

这意味着：

- 架构对齐 AgentHub 的 Hub-Edge-Runner 方向；
- 保持聊天 Demo 可用、打磨到位、可部署；
- 优先类型化协议契约、经过测试的 store 行为以及可恢复的 UI 状态，而非一次性 UI 补丁；
- 记录哪些经验应反馈至 `D:\Code\AgentHub`；
- 每次代码变更均以聚焦测试加对应层级的 build/类型检查加以验证。

## 设计原则

1. **AgentHub 优先**
   TokenDanceChat 验证 AgentHub 的 IM Collaboration 与 Hub Network 层。它不应演化为独立产品架构。

2. **可玩 Demo 次之**
   应用应保持使用乐趣：DM、群组、通话、emoji、GIF、文件夹、翻译、webhook 以及 Agent 聊天之所以有价值，是因为它们给平台带来真实的压力。

3. **类型化 realtime 协议**
   新增 realtime 功能应通过显式 WebSocket 消息类型、类型化前端 API helper 以及 store 方法流转。避免隐藏的 ad hoc 事件数据。

4. **SQLite 作为早期 Hub 事实来源**
   持久化应保持显式、可迁移、受 store 测试覆盖。若某功能变更持久化状态，需在展开 UI 工作前定义表/store 契约。

5. **小步验证增量**
   倾向带有回归测试的窄范围变更。UI 行为尽可能增加 Vitest 覆盖；协议/store 变更则围绕 store、handler 或 hub 边界增加 Go 测试。

6. **禁止敏感运维信息外泄**
   公开文档可描述部署形态，但不得包含服务器 IP、内部端口、SSH 细节、凭据或生产数据。

7. **多模态 UI 验收**
   有意义的前端打磨必须通过真实浏览器截图与指标加以验证。生成的 `gpt-image-2` 参考图可引导视觉方向，但不可作为验收证据。

## 工作流

| 优先级 | 工作流 | 重要性 |
|---|---|---|
| P0 | 架构/文档对齐 | 使未来 AgentHub 迁移工作有据可依，防止 TokenDanceChat 偏离为无关聊天产品。 |
| P0 | 协议与 store 加固 | WebSocket 与 SQLite 契约是 AgentHub 可复用的主要证据。 |
| P0 | 验证基线 | 一个无法测试或稳定构建的 Demo 对 AgentHub 而言是弱证据。 |
| P1 | Agent 作为联系人的体验 | 直接验证 AgentHub 的 IM Collaboration 前提。 |
| P1 | 群组协作功能 | 群组、webhook、通话、角色及通知对 Hub 语义进行压力测试。 |
| P1 | 前端状态与组件清理 | 大文件 UI 对 spike 可接受，但已验证的模式应更易于迁移至 AgentHub。 |
| P2 | Demo 打磨 | 使 Demo 更可信时有用；不验证平台假设时次要。 |

## 当前高价值后续步骤

1. 为群组视频通话设置添加浏览器级冒烟覆盖，使用双会话或 mock 媒体/WebRTC 边界。
2. 在生产使用前，添加 webhook 密钥轮换与审计日志设计。
3. 仅在测试或迁移压力合理时才拆分最大 UI 面，从 `MessageBubble.tsx` 与 `VideoCall.tsx` 开始。
4. 每当某功能验证了可复用原语——尤其是 WebSocket 事件、store 接口与 Agent UX——即添加 AgentHub 映射说明。
5. 每个里程碑后保持 `AGENTS.md`、README、ROADMAP 与 `docs/agenthub-validation.md` 同步。

## 必要验证

使用能证明变更的最小命令，声明完成前再运行更广泛的检查。

| 变更类型 | 最低验证 |
|---|---|
| Go 后端/store/协议 | `cd backend && go test ./...` |
| 前端组件/store/API | `cd frontend && npm test -- --run <聚焦测试>` 外加 `npx tsc --noEmit` |
| 前端构建/运行时面 | `cd frontend && npm run build` |
| 前端视觉打磨 | `cd frontend && npm run visual:acceptance`，然后检查截图输出目录 |
| 仅文档 | 阅读变更后的文档检查链接/路径，并 `git diff --check` |
| 部署 | 重启后健康检查，以及与变更相关的 WebSocket/手动冒烟测试 |

## 决策规则

在两个下一步任务之间选择时，优先选择最能满足以下排序的任务：

1. 修复正确性、安全性或数据完整性风险；
2. 强化 AgentHub 可复用原语；
3. 保持 Demo 可部署、可测试；
4. 改善面向用户的 Demo 体验；
5. 降低未来维护成本。
