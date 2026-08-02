# 能力矩阵 Capability Matrix

> **本矩阵是仓库唯一的能力事实来源。** README、ROADMAP、agenthub-validation 等文档中的能力表述以本矩阵为准；不一致时以本矩阵为准并修正文档。最后更新：2026-08-03。

## 状态定义

| 状态 | 含义 |
|---|---|
| Core | 在用：当前产品合同启用并持续使用。 |
| Experiment | 实验：当前启用，但有明确验证问题或未完成验收。 |
| Compat | 只读兼容：前端只读展示或后端协议兼容保留，主界面不提供入口。 |
| Archived | 已退休：前端入口已删除；标注「运行面清理中」表示后端路由/WS 事件仍注册，由后续 PR 删除（见各注）。 |

列说明：UI=当前前端主界面是否有入口；HTTP=当前前端是否调用相关 REST API（括号注后端仍注册的路由）；WS=当前前端是否消费/发送相关事件（括号注后端仍处理的事件）；数据写入=当前产品合同下是否仍产生数据写入；历史读取=历史数据是否仍可只读展示；生产启用=生产部署当前是否启用。

## 矩阵

| 能力 | 状态 | UI | HTTP | WS | 数据写入 | 历史读取 | 生产启用 |
|---|---|---|---|---|---|---|---|
| 公共消息 | Core | 有（公共聊天室） | 有（/api/messages、/api/search、/api/export、/api/stats） | 有（message/reaction/edit/delete 等） | 有 | 有 | 是 |
| Agent mention（@TokenBot / @PicoClaw） | Core | 有（侧栏入口 + 输入框 mention） | 有（LLM 代理走后端） | 有（流式回复持久化） | 有 | 有 | 是 |
| OIDC 登录（TokenDance ID） | Core | 有（OIDC 登录按钮） | 有（/api/oidc/*，按 CHAT_OIDC_ENABLED 注册） | 有（join 携带 OIDC access token） | 有 | — | 是（受开关控制） |
| 游客身份 | Experiment | 有（未登录自动 guest 加入） | 无 | 有（join 不带 token） | 有 | 有 | 是 |
| 本地注册/登录 | Experiment | 有（AuthModal 注册/登录） | 有（/api/register、/api/login） | 有（join 携带 session_token） | 有 | 有 | 是 |
| 自定义 Emoji | Compat（上传/删除入口仍在运行面，清理待裁决） | 有（EmojiPicker 展示 customEmojis，并保留「上传表情」按钮与删除） | 有（/api/emoji/upload、/uploads/emojis/ 仍注册） | 有（custom_emoji_add/list/delete 仍处理） | 有 | 有 | 是 |
| DM/群组 | Compat | 无（主界面不暴露） | 无 | 后端协议保留（dm_message、group_*、friend_*）；前端不消费 | 否 | 有（历史数据仍在 store） | 否 |
| Webhook | Archived（运行面清理中） | 无 | 后端 /api/webhook/ 仍注册（HTTP ingress）；前端无调用 | 后端 webhook 相关事件仍处理；前端不消费 | 否 | 有（历史消息只读） | 否 |
| Giphy 检索 | Archived（已清理） | 无 | 无（/api/giphy/* 路由已删除，请求 404） | 无 | 否 | 否 | 否 |
| 普通文件上传 | Archived（已清理） | 无（composer 无附件/图片入口） | 无（/api/upload、/uploads/ 路由已删除，请求 404） | 无 | 否 | 否（历史上传文件不再可访问） | 否 |
| 语音/视频通话 | Archived（运行面清理中） | 无 | 无 | 后端 call_* 事件仍处理；前端不消费 | 否 | 否 | 否 |
| 定时消息 | Archived（运行面清理中） | 无 | 无 | 后端 schedule_* 事件仍处理；前端不消费 | 否 | 否 | 否 |
| 转发 | Archived（运行面清理中） | 无 | 无 | 后端 forward 事件仍处理；前端不消费 | 否 | 有（历史转发标记只读） | 否 |
| GIF picker（前端） | Archived（运行时代码已删除） | 无 | 无 | 无 | 否 | 否 | 否 |

## 说明

- **普通文件上传已退休**：前端入口已删（composer 无附件/图片工具）；后端 `/api/upload`、`/uploads/` 路由已删除（2026-08-03 清理），请求返回 404，历史上传文件不再可访问。
- **自定义 Emoji**：EmojiPicker 仍展示 customEmojis 且保留上传/删除入口（调用 `/api/emoji/upload`），与「只读展示」不符——上传入口是否一并退休待裁决（见 BLOCKED.md）。
- 其余 Archived 能力的后端路由/WS 事件（/api/webhook/、call_*、schedule_*、forward 等）同理属「运行面清理中」，前端一律无入口。
- 状态随代码事实更新：任何能力增删或运行面清理完成后，先更新本矩阵，再同步其他文档。
