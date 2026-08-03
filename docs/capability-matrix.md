# 能力矩阵 Capability Matrix

> **本矩阵是仓库唯一的能力事实来源。** 每行描述当前可调用运行面（UI/HTTP/WS/数据写入），而非目标状态。最后更新：2026-08-03。

## 状态定义

| 状态 | 含义 |
|---|---|
| Core | 在用：当前产品合同启用并持续使用。 |
| Experiment | 实验：当前启用，但未完成最终产品裁决（验证问题待回答、入口待加固或退休）。 |
| Compat | 兼容保留：后端路由/WS 事件/数据写入仍可执行，主界面不提供入口。 |
| Archived | 已退休：运行面代码已删除，请求返回 404/405。 |

列说明：UI=当前前端主界面是否有入口；HTTP=当前后端是否注册 REST 路由；WS=当前后端是否处理 WebSocket 事件；数据写入=当前是否仍可产生数据写入；历史读取=历史数据是否仍可只读展示；生产启用=生产部署当前是否启用。

## 矩阵

| 能力 | 状态 | UI | HTTP | WS | 数据写入 | 历史读取 | 生产启用 |
|---|---|---|---|---|---|---|---|
| 公共消息 | Core | 有（公共聊天室） | 有（/api/messages、/api/search、/api/export、/api/stats） | 有（message/reaction/edit/delete 等） | 有 | 有 | 是 |
| Agent mention（@TokenBot / @PicoClaw） | Core | 有（侧栏入口 + 输入框 mention） | 有（LLM 代理走后端） | 有（流式回复持久化） | 有 | 有 | 是 |
| OIDC 登录（TokenDance ID） | Core | 有（OIDC 登录按钮） | 有（/api/oidc/*，按 CHAT_OIDC_ENABLED 注册） | 有（join 携带 OIDC access token） | 有 | — | 是（受开关控制） |
| 游客身份 | Experiment | 有（未登录自动 guest 加入） | 无 | 有（join 不带 token） | 有 | 有 | 是 |
| 本地注册/登录 | Experiment | 有（AuthModal 注册/登录） | 有（/api/register、/api/login） | 有（join 携带 session_token） | 有 | 有 | 是 |
| 自定义 Emoji | Experiment | 有（EmojiPicker 展示、上传、删除） | 有（/api/emoji/upload、/uploads/emojis/） | 有（custom_emoji_add/list/delete） | 有 | 有 | 是 |
| DM/群组 | Compat | 无（主界面不暴露） | 有（后端 group_*、friend_*、dm_* 路由仍注册） | 有（后端 group_*、friend_*、dm_message 等事件仍处理） | 否（前端不发送） | 有（历史数据仍在 store） | 否 |
| Webhook | Compat | 无（主界面不暴露） | 有（/api/webhook/ 仍注册，HTTP ingress 可执行） | 有（webhook 相关事件仍处理） | 可（/api/webhook/ 写入路径仍打开） | 有（历史消息只读） | 否 |
| 语音/视频通话 | Compat | 无 | 无 | 有（后端 call_* 事件仍处理） | 否（前端不发送） | 否 | 否 |
| 定时消息 | Compat | 无 | 无 | 有（后端 schedule_* 事件仍处理） | 否（前端不发送） | 否 | 否 |
| 转发 | Compat | 无 | 无 | 有（后端 forward 事件仍处理） | 否（前端不发送） | 有（历史转发标记只读） | 否 |
| Giphy 检索 | Archived | 无 | 无（/api/giphy/* 路由已删除，请求 404） | 无 | 否 | 否 | 否 |
| 普通文件上传 | Archived | 无（composer 无附件/图片入口） | 无（/api/upload、/uploads/ 路由已删除，请求 404） | 无 | 否 | 否（历史上传文件不再可访问） | 否 |
| GIF picker（前端） | Archived | 无 | 无 | 无 | 否 | 否 | 否 |

## 说明

- **普通文件上传已退休**：前端入口已删；后端路由已删除（2026-08-03），请求返回 404；历史上传文件不再可访问。
- **自定义 Emoji 当前为活动状态**：EmojiPicker 展示 customEmojis、保留上传/删除入口、调用 `/api/emoji/upload`。后续需裁决：保留加固（Core）或退休（Archived）。
- **Webhook 仍是有效风险**：`/api/webhook/` 路由与写入路径仍存在，不能因 UI 隐藏视为关闭。
- **Compat 状态的能力**：后端路由/WS 事件仍可执行，但主界面不提供入口。未完成运行面清理前不标注 Archived。相关安全 Issue（如 #15/#16）在写入路径删除前不得关闭。
- 状态随代码事实更新：任何能力增删或运行面清理完成后，先更新本矩阵，再同步其他文档。