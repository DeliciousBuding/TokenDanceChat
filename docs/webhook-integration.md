# Webhook Integration

Last updated: 2026-05-23

Incoming webhooks let a group owner or admin create a group-scoped HTTP endpoint that can post messages into that group.

This is both a demo feature and an AgentHub validation slice: it exercises group permissions, typed WebSocket control events, SQLite persistence, secret handling, and external-to-Hub message ingress.

## Security Contract

- Only group owners and admins can create, list, or delete webhooks.
- `webhook_create` returns the generated secret once, only to the creator's WebSocket connection.
- `webhook_list` never returns secrets.
- `store.Webhook.Secret` is tagged `json:"-"` to prevent accidental JSON leakage.
- Frontend state stores the one-time secret separately from the normal redacted webhook list.
- Webhook secrets are persisted as versioned salted HMAC hashes in SQLite and verified with constant-time comparison.
- Existing plaintext webhook rows are migrated to hashes when the store starts.
- Production follow-ups: secret rotation and audit logging for create/delete events.

## WebSocket Control Events

### Create

Client request:

```json
{
  "type": "webhook_create",
  "group": "team"
}
```

Server response to creator:

```json
{
  "type": "webhook_created",
  "group": "team",
  "id": "webhook-id",
  "content": "webhook-path",
  "secret": "secret-shown-once"
}
```

The frontend composes the usable HTTP URL as:

```text
/api/webhook/{content}?secret={secret}
```

### List

Client request:

```json
{
  "type": "webhook_list",
  "group": "team"
}
```

Server response:

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

No `secret` field is present in list responses.

### Delete

Client request:

```json
{
  "type": "webhook_delete",
  "group": "team",
  "id": "webhook-id"
}
```

Server response:

```json
{
  "type": "webhook_deleted",
  "group": "team",
  "id": "webhook-id"
}
```

## HTTP Message Ingress

Request:

```bash
curl -X POST "https://chat.example.com/api/webhook/webhook-path?secret=secret-shown-once" \
  -H "Content-Type: application/json" \
  -d '{"content":"Deploy finished","username":"ci-bot"}'
```

Body:

```json
{
  "content": "Deploy finished",
  "username": "ci-bot"
}
```

`username` is optional and defaults to `webhook`.

Success response:

```json
{
  "status": "ok"
}
```

## Verification

Focused backend tests:

```powershell
cd backend
go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin)"
go test ./store -run "Test(CreateWebhookDoesNotPersistPlaintextSecret|WebhookPlaintextSecretMigrationHashesExistingRows)"
go test ./handler -run TestWebhookHandlerVerifiesHashedSecret
```

Focused frontend tests:

```powershell
cd frontend
npm test -- --run src/stores/chatStore.test.ts src/components/GroupInfoPanel.test.tsx
```

Broader gates:

```powershell
cd backend
go test ./...

cd ..\frontend
npx tsc --noEmit
```
