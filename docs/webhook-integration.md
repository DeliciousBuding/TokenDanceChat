# Webhook 集成

最后更新：2026-05-25

入站 webhook 允许群主或管理员创建一个群组范围的 HTTP 端点，用于向该群组发送消息。

这既是 Demo 功能，也是 AgentHub 验证切片：它覆盖群组权限、类型化 WebSocket 控制事件、SQLite 持久化、密钥处理以及外部到 Hub 的消息入口。

## 安全契约

- 仅群主与管理员可创建、列举或删除 webhook。
- `webhook_create` 仅向创建者的 WebSocket 连接返回一次生成的密钥。
- `webhook_list` 永不返回密钥。
- `store.Webhook.Secret` 标记为 `json:"-"` 以防止意外 JSON 泄露。
- 前端状态将一次性密钥与常规脱敏 webhook 列表分开存储。
- 前端群组管理员控件依赖 `group_info.group_members` 角色数据；客户端在决定是否展示 Webhook 管理前应对其标准化。
- Webhook 密钥在 SQLite 中以带版本号的加盐 HMAC 哈希形式持久化，并使用 constant-time 比较进行验证。
- 现有明文 webhook 行在 store 启动时迁移为哈希。
- HTTP 入口仅接受 `Authorization: Bearer <secret>`，不接受 query string 中的 secret。
- HTTP 请求体限制为 8 KiB，`content` 限制为 2000 字符；发送者显示名由服务端固定为 `webhook`。

## WebSocket 控制事件

### 创建

客户端请求：

```json
{
  "type": "webhook_create",
  "group": "team"
}
```

服务器响应至创建者：

```json
{
  "type": "webhook_created",
  "group": "team",
  "id": "webhook-id",
  "content": "webhook-path",
  "secret": "secret-shown-once"
}
```

前端展示的 HTTP URL 不包含 secret；一次性 secret 只用于 `Authorization` header：

```text
/api/webhook/{content}
Authorization: Bearer {secret}
```

### 列举

客户端请求：

```json
{
  "type": "webhook_list",
  "group": "team"
}
```

服务器响应：

```json
{
  "type": "webhook_list",
  "group": "team",
  "webhooks": [
    {
      "id": "webhook-id",
      "group_name": "team",
      "url": "webhook-path",
      "created_by": "alice",
      "created_at": 1760000000000
    }
  ]
}
```

列举响应中不包含 `secret` 字段。

### 删除

客户端请求：

```json
{
  "type": "webhook_delete",
  "group": "team",
  "id": "webhook-id"
}
```

服务器响应：

```json
{
  "type": "webhook_deleted",
  "group": "team",
  "id": "webhook-id"
}
```

### 密钥轮换

客户端请求：

```json
{
  "type": "webhook_rotate",
  "group": "team",
  "id": "webhook-id"
}
```

服务器响应至发起者：

```json
{
  "type": "webhook_rotated",
  "group": "team",
  "id": "webhook-id",
  "content": "webhook-path",
  "secret": "new-secret-shown-once"
}
```

- 旧密钥立即失效，后续使用旧密钥的 HTTP POST 请求将被拒绝。
- 仅群主或管理员可轮换。
- 新密钥仅在此 `webhook_rotated` 响应中一次性返回，不会出现在 `webhook_list` 或其他事件中。

### 审计日志

客户端请求：

```json
{
  "type": "webhook_audit_list",
  "group": "team"
}
```

服务器响应：

```json
{
  "type": "webhook_audit_list",
  "group": "team",
  "audit_logs": [
    {
      "id": "audit-log-id",
      "webhook_id": "webhook-id",
      "group_name": "team",
      "action": "created",
      "actor": "alice",
      "created_at": 1760000000000
    }
  ]
}
```

- `action` 取值：`created`、`rotated`、`deleted`。
- 审计日志绝不包含密钥哈希或 webhook metadata。
- 仅群主或管理员可查看审计日志。

## HTTP 消息入口

请求：

```bash
curl -X POST "https://chat.example.com/api/webhook/webhook-path" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer secret-shown-once" \
  -d '{"content":"Deploy finished"}'
```

请求体：

```json
{
  "content": "Deploy finished"
}
```

请求体只使用 `content`。消息进入群聊时的发送者显示名由服务端固定为 `webhook`，避免外部调用者伪装成普通用户。

成功响应：

```json
{
  "status": "ok"
}
```

## 验证

聚焦后端测试：

```powershell
cd backend
go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin)"
go test ./store -run "Test(CreateWebhookDoesNotPersistPlaintextSecret|WebhookPlaintextSecretMigrationHashesExistingRows)"
go test ./handler -run "TestWebhookHandler(VerifiesHashedSecret|RejectsQuerySecret|RejectsOversizedBody|RejectsOversizedContent|UsesServerDerivedSender)$"
```

当前前端轻量主合同不暴露群组或 webhook 管理面板，因此不再维护
`GroupInfoPanel` / `webhook-ingress` 浏览器测试。前端回归以公共房间、
TokenBot、消息渲染和 composer 为准；webhook 只保留后端安全
兼容测试。

更广泛的门禁：

```powershell
cd backend
go test ./...

cd ..\frontend
npx tsc --noEmit
```
