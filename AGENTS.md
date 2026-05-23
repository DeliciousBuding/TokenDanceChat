# TokenDanceChat Agent Guide

Last updated: 2026-05-23

## Project Identity

TokenDanceChat is the AgentHub technical validation project and a playable demo.

It validates AgentHub's Hub/IM stack through a real chat product surface:

- Go Hub Server with typed WebSocket events.
- SQLite/FTS5 persistence for early Hub state.
- React 19 + Zustand + Vite client state and UI.
- Agent-as-contact UX through TokenBot, PicoClaw, mentions, DMs, group collaboration, and streaming replies.

Do not treat this repository as a separate long-term product architecture. The reusable lessons should feed back into `D:\Code\AgentHub`.

## Durable State

- `ROADMAP.md` is the long-running goal ledger. Update it after every meaningful implementation, verification, or decision.
- `AGENTS.md` is the project-level operating guide. Keep it useful enough that a new agent can continue without a separate transfer document.
- `docs/agenthub-validation.md` explains the AgentHub mapping.
- `docs/engineering-goal.md` explains the long-term engineering goal and verification expectations.
- `docs/webhook-integration.md` documents the current webhook protocol.
- `docs/visual-acceptance.md` defines screenshot and aesthetic acceptance for frontend polish.

Do not create a separate project transfer file. If takeover context is needed, fold it into this file or `ROADMAP.md`.

## Current Priorities

1. Keep the AgentHub validation framing explicit in docs and implementation choices.
2. Improve Feishu/Lark chat parity and Telegram-grade chat experience.
3. Prefer typed WebSocket protocol changes with backend and frontend tests.
4. Harden security-sensitive contracts before broad UI polish.
5. Keep the demo runnable, testable, and deployable.

## Current Increment

Webhook at-rest security, media storage, and screenshot-driven UI acceptance are the active completed slices in this worktree:

- Webhook secrets are generated as high-entropy one-time values, stored as versioned salted HMAC hashes in SQLite, and verified through constant-time comparison.
- Legacy plaintext webhook rows are migrated to hashes at store startup.
- HTTP webhook ingress verifies secrets through `store.VerifyWebhookSecret`; list responses remain owner/admin-only and redacted.
- `webhook_rotate` invalidates old secrets immediately, writes an append-only audit log row (created/rotated/deleted), and returns a one-time new secret to the caller.
- `webhook_audit_list` returns redacted audit events per group; audit log rows never contain secret hash or metadata via DTO.
- `MediaStore` supports local disk, WebDAV, and S3-compatible storage.
- S3-compatible media config is env-driven and preferred for production-server deployment shape.
- Ordinary uploads and custom emoji both use safe media keys and same-origin `/uploads/...` routes.
- Docker runtime images include a same-container `/api/health` HEALTHCHECK that follows `CHAT_ADDR`, including non-default listeners such as `:3000`.
- Frontend defaults to light mode for a Feishu/Lark-like first impression.
- Mobile composer keeps the textarea usable by collapsing Markdown tools behind an icon.
- Mobile secondary chat actions are behind the more menu so `公共聊天` remains readable.
- Message transcript density has been tightened for mobile/tablet, including removal of duplicated non-own bottom timestamps.
- Per-message hover actions are consolidated into a single 44px message action menu; copy, forward, translate, react, pin, edit, delete, and select remain available from the menu.
- Header actions, formatting controls, scheduled-message entry, sidebar utility buttons, and clickable avatars now meet the 44px visual acceptance target in the screenshot pass.
- Desktop sidebar density has been tightened: four model preview cards, compact empty states, and the online-user section appears above the fold.
- Core chat surface visual weight has been reduced: message bubbles use quieter borders, composer utility buttons are lighter, the expanded Markdown toolbar is less dominant, and clickable avatars use a 46px floor to avoid pixel-rounding failures.
- Group info/admin surfaces are now part of visual acceptance: the script creates a real group, opens the right-side panel, verifies the owner-only Webhook section, and gates panel controls against the 44px target.
- Frontend `group_info` handling reads the backend `group_members` role payload, so owner/admin roles now drive group info and Webhook management after a real WebSocket round trip.
- The group-info screenshot gate now also checks desktop title single-line stability and a visible group empty state, after manual screenshot review caught header squeeze and sparse first-run group content.
- Browser E2E now covers the complete Webhook ingress loop: group admin creates a one-time webhook in the UI, HTTP POSTs to the generated URL, and sees the external message appear in the group transcript.
- Visual acceptance is backed by `npm run visual:acceptance`, real browser screenshots, metrics, and aesthetic review.
- Generated `gpt-image-2` references may guide art direction, but cannot replace real browser screenshots for acceptance.
- Current accepted clean-DB screenshot pass: `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-23T04-02-23-020Z`.
- Tablet and mobile use the compact top bar until `lg`; 768px must not be forced into the desktop sidebar/header layout.

Remaining follow-ups:

- Add group video call multi-browser smoke/e2e.

## Architecture Map

```text
backend/main.go                 HTTP + WS entrypoint
backend/handler/handler.go      REST handlers, auth, uploads, webhook HTTP ingress
backend/handler/media.go        local/WebDAV/S3-compatible media storage
backend/hub/hub.go              Store interface, Message struct, Hub state
backend/hub/client.go           WebSocket message handlers
backend/store/store.go          SQLite schema and CRUD
frontend/src/lib/api.ts         typed frontend API/WebSocket helper
frontend/src/hooks/useWebSocket.ts
frontend/src/lib/groupInfo.ts       group_info role normalization for backend group_members payloads
frontend/src/stores/chatStore.ts
frontend/src/components/ChatLayout.tsx
frontend/src/components/MessageBubble.tsx
frontend/src/components/MessageTranscript.tsx
frontend/src/components/GroupInfoPanel.tsx
```

## Verification Commands

Run focused checks first, then broad checks before claiming completion.

```powershell
# Backend focused webhook regression
cd D:\Code\Projects\TokenDanceChat\backend
go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin|AuditListRedactsMetadataAndRequiresGroupAdmin)"
go test ./store -run "Test(CreateWebhookDoesNotPersistPlaintextSecret|WebhookPlaintextSecretMigrationHashesExistingRows|RotateWebhookSecretInvalidatesOldSecretAndAudits)"
go test ./handler -run TestWebhookHandlerVerifiesHashedSecret

# Backend focused media regression
go test ./handler -run "Test(UploadEmojiStoresViaMediaStore|ServeEmojiReadsViaMediaStore|S3MediaStoreSaveAndOpen|MediaStoreRejectsTraversalKeys)"

# Backend full
go test ./...

# Docker healthcheck sanity
docker build --check -f Dockerfile .
docker build --check -f Dockerfile.runtime .

# Frontend focused webhook/store regression
cd D:\Code\Projects\TokenDanceChat\frontend
npm test -- --run src/stores/chatStore.test.ts src/components/GroupInfoPanel.test.tsx
npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium

# Frontend type check
npx tsc --noEmit

# Frontend build and visual review
npm run build
# Serve the production build with the Go backend, then:
npm run visual:acceptance

# Repository diff hygiene
cd D:\Code\Projects\TokenDanceChat
git diff --check
```

## Engineering Rules

- Use `rg` first for search; fall back to PowerShell only if needed.
- Use `apply_patch` for manual edits.
- Do not revert user or unrelated changes.
- Do not stage or commit unrelated temporary files such as `tmp_*`.
- Prefer small, verified increments over broad rewrites.
- For behavior changes, add focused tests before or alongside implementation.
- Keep docs synchronized when protocol, security, deployment, or AgentHub validation behavior changes.

## Frontend Rules

- Preserve the existing React 19 + Zustand + Tailwind patterns.
- Chat UI should feel restrained and work-focused like Feishu/Lark, with smooth message flow like Telegram.
- Light mode is the primary aesthetic acceptance target; dark mode must remain usable but not dominate first-run review.
- Use `lucide-react` icons for controls where possible.
- Do not use marketing-style landing pages or decorative cards for core app surfaces.
- Keep text within controls and panels; test dense UI on narrow widths when practical.
- Use screenshot metrics from `docs/visual-acceptance.md` before claiming meaningful UI polish is complete; real screenshots are mandatory for UI polish acceptance.
- `gpt-image-2` mockups can be used as art-direction references for layout, icons, density, and hierarchy, but acceptance still requires real browser screenshots.
- For security-sensitive UI such as webhook secrets, keep one-time secrets separate from normal persistent state.

## Backend Rules

- Treat WebSocket message types as API contracts.
- Keep store behavior explicit and covered by tests when durable state changes.
- Do not expose secrets in list responses or broad DTOs.
- Do not expose object-storage credentials or direct bucket URLs to the frontend; keep same-origin `/uploads/...` routes.
- Prefer role checks at the handler boundary for group/admin actions.
- Webhook secrets must be stored as versioned salted HMAC hashes and verified with constant-time comparison.

## Security And Ops Boundaries

- Do not commit production hostnames, IPs, SSH aliases, container names, internal ports, live data paths, credentials, API keys, or deployment logs.
- Public docs may describe deployment shape and verification commands, not private infrastructure details.
- `SECURITY.md` tracks security posture; keep it current when security-sensitive behavior changes.

## AgentHub Mapping

| TokenDanceChat area | AgentHub destination | Maturity |
|---|---|---|
| `backend/hub/` typed event handlers | Hub Server event contract | Demo-validated |
| `backend/store/` SQLite persistence | Hub Server persistence patterns | Demo-validated |
| `frontend/src/lib/api.ts` and `useWebSocket` | Shared realtime client helpers | Demo-validated |
| Group roles, webhooks, calls | IM collaboration primitives | Under validation |
| `MediaStore` local/WebDAV/S3 abstraction | Hub media deployment primitive | Under validation |
| TokenBot/PicoClaw surfaces | Agent-as-contact UX | Under validation |

When a feature proves a reusable primitive, document the lesson in `docs/agenthub-validation.md` or a focused `docs/` file.
