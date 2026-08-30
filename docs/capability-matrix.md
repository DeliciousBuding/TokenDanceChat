# 能力矩阵 Capability Matrix

> **本矩阵是仓库唯一的能力事实来源。** 每行描述当前可调用运行面（UI/HTTP/WS/数据写入），而非目标状态。最后更新：2026-08-31。

## 状态定义

| 状态 | 含义 |
|---|---|
| Core | 在用：当前产品合同启用并持续使用。 |
| Experiment | 实验：当前启用，但未完成最终产品裁决。**Experiment（retirement pending）** 表示该能力无已知真实消费者，倾向退休，由 #53 负责逐项裁决——验证问题、退出条件、owner 见 #53。 |
| Compat | 兼容保留：**必须存在真实旧消费者**，只允许必要读取和解码，不扩大也不新增写入。无真实消费者则不标 Compat。 |
| Archived | 已退休：运行面代码已删除，HTTP 请求返回 404，WS 不处理对应事件。 |

列说明：UI=当前前端主界面是否有入口；HTTP=当前后端是否注册 REST 路由；WS=当前后端 switch 是否处理 WebSocket 事件；数据写入=当前是否仍可产生数据写入（通过 WS 或 HTTP）；历史读取=历史数据是否仍可只读展示；生产启用=二进制中是否包含该处理器。

## 矩阵

| 能力 | 状态 | UI | HTTP | WS | 数据写入 | 历史读取 | 生产启用 |
|---|---|---|---|---|---|---|---|
| 公共消息 | Core | 有（公共聊天室） | 有（/api/messages、/api/search、/api/export） | 有（message） | 有 | 有 | 是 |
| 私聊助手 1:1（TokenBot） | Core | 有（侧栏"私人助手"独立视图） | 有（/api/messages?to=，鉴权） | 有（message to=BotName + private stream） | 有（to_user 列） | 有 | 是 |
| 消息反应 | Core | 有（消息气泡 reaction 按钮） | 无 | 有（reaction） | 有 | 有 | 是 |
| 消息编辑/删除 | Core | 有（消息气泡编辑/删除菜单） | 无 | 有（message_edit、message_delete） | 有 | 有 | 是 |
| 引用回复/线程 | Core | 有（回复预览、ThreadPanel） | 无 | 有（thread_messages） | 有 | 有 | 是 |
| 消息搜索 | Core | 有（搜索栏入口） | 有（/api/search） | 无 | 无 | 有 | 是 |
| Agent mention（@TokenBot） | Core | 有（输入框 mention） | 有（LLM 代理走后端） | 有（流式回复持久化） | 有 | 有 | 是 |
| OIDC 登录（TokenDance ID） | Core | 有（OIDC 登录按钮） | 有（/api/oidc/*，按 CHAT_OIDC_ENABLED 注册） | 有（join 携带 OIDC access token） | 有 | — | 是（受开关控制） |
| 游客身份 | Experiment | 有（未登录自动 guest 加入，localStorage 持久化身份） | 无 | 有（join 不带 token） | 有 | 有 | 是 |
| 本地注册/登录 | Experiment | 有（AuthModal 注册/登录） | 有（/api/register、/api/login） | 有（join 携带 session_token） | 有 | 有 | 是 |
| 自定义 Emoji | Experiment | 有（EmojiPicker 展示、上传、删除） | 有（/api/emoji/upload、/uploads/emojis/） | 有（custom_emoji_add/list/delete） | 有 | 有 | 是 |
| 投票 | Experiment（retirement pending） | 有（PollMessage 组件渲染、投票、关闭） | 无 | 有（poll_create/vote/close） | 可（WS 可写） | 有 | 是 |
| 聊天文件夹 | Archived | 无 | 无（404） | 无（WS handler 已删，2026-08-31） | 否 | 有（历史只读） | 否 |
| DM/群组 | Archived | 无 | 无 | 无（group_*/friend_*/dm_* WS handler 已删，2026-08-31） | 否 | 有（历史只读） | 否 |
| Webhook | Archived | 无 | 无（/api/webhook/ 路由已删，404，2026-08-31） | 无 | 否 | 有（历史只读） | 否 |
| 语音/视频通话 | Archived | 无 | 无 | 无（call_* WS handler 已删，2026-08-31） | 否 | 否 | 否 |
| 定时消息 | Archived | 无 | 无 | 无（schedule_* 已删，2026-08-31） | 否 | 否 | 否 |
| 转发 | Archived | 无 | 无 | 无（forward 已删，2026-08-31） | 否 | 有（历史标记只读） | 否 |
| Giphy 检索 | Archived | 无 | 无（路由已删除，404） | 无 | 否 | 否 | 否 |
| 普通文件上传 | Archived | 无（composer 无附件/图片入口） | 无（路由已删除，404） | 无 | 否 | 否（历史上传文件不再可访问） | 否 |
| GIF picker（前端） | Archived | 无 | 无 | 无 | 否 | 否 | 否 |

## 说明

- **2026-08-31：公共聊天室 / 私聊助手分离**。侧栏选 TokenBot 进入独立 1:1 私聊视图（`to=BotName` 走私聊通道，不广播、只回发起者）；历史经 `GET /api/messages?to=`（鉴权、按请求者作用域）加载。公共房间 `@TokenBot` mention 仍公开回复。
- **2026-08-31：遗留 IM 运行面切除**。DM/群组、Webhook、通话、定时消息、转发、文件夹的后端 WS handler 与路由已删除（转 Archived）；bot 仅响应 `@TokenBot`，无关键词/概率抢答。
- **2026-08-30：收敛为 TokenBot 单 agent**：旧第二 Agent 工作区入口移除，`@TokenBot` 为唯一 assistant；`GET /api/config` 暴露 bot 名、模型与 LLM 启用状态，前端不再有假模型选择器。
- **普通文件上传已退休**：前端入口已删；后端路由已删除（2026-08-03），请求返回 404；历史上传文件不再可访问。
- **自定义 Emoji 当前为活动状态**：EmojiPicker 展示 customEmojis、保留上传/删除入口、调用 `/api/emoji/upload`。后续需裁决：保留加固（Core）或退休（Archived）。
- **投票仍为 Experiment（retirement pending）**：后端保留 poll_*；由后续裁决保留或退休。
- 状态随代码事实更新：任何能力增删或运行面清理完成后，先更新本矩阵，再同步其他文档。