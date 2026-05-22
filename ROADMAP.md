# TokenDanceChat ROADMAP

Last updated: 2026-05-23

## Current Goal

TokenDanceChat is the AgentHub Hub/IM validation project and a playable demo.

The long-running product goal is to validate AgentHub's realtime Hub, SQLite persistence, React client state, Agent-as-contact UX, and deployment shape while evolving the demo toward:

- Feishu/Lark-style 1:1 chat feature parity for enterprise collaboration;
- Telegram-grade message flow, conversation ergonomics, and mobile interaction quality;
- a secure, testable, deployable engineering baseline that can feed lessons back into `D:\Code\AgentHub`.

`ROADMAP.md` is the durable goal ledger for future agents. Update it after every meaningful implementation, verification, security review, or scope decision.

## Product Principles

1. **AgentHub first**
   TokenDanceChat validates AgentHub's IM collaboration and Hub network layers. It must not become a separate long-term product architecture.

2. **Playable demo**
   The app should remain useful and enjoyable: DMs, groups, calls, emoji, GIFs, files, folders, translation, webhooks, and Agent chat are valuable because they put realistic pressure on the platform.

3. **Typed realtime protocol**
   New capabilities should use explicit WebSocket message types, typed frontend helpers, store contracts, and focused tests.

4. **Security by default**
   Secrets should be one-time or redacted where practical; production-only details stay out of public docs; security findings are tracked in `SECURITY.md` and this roadmap.

5. **Verified increments**
   Every code change needs a focused check and then broader verification before it is called complete.

## Active Workstreams

| Priority | Workstream | Target |
|---|---|---|
| P0 | AgentHub validation alignment | Keep README, docs, roadmap, protocol, and store contracts mapped to AgentHub primitives. |
| P0 | Protocol/store hardening | Treat WebSocket events and SQLite tables as reusable Hub evidence; add regression tests for security-sensitive contracts. |
| P0 | Verification baseline | Keep `go test ./...`, frontend focused tests, `npx tsc --noEmit`, and `git diff --check` green. |
| P1 | Feishu parity | Group admin, webhooks, files, threads, reactions, notifications, search, calls, admin surfaces, and enterprise collaboration flows. |
| P1 | Telegram UX | Fast message list, clean input, mobile gestures, copy/reply/edit ergonomics, polished transitions, media viewer quality. |
| P1 | Agent-as-contact | Make TokenBot/PicoClaw feel like IM contacts: DM, group mention, streaming replies, model/provider affordances, and workflow transfer. |
| P2 | Operations/performance | Health checks, deployment checklist, bundle/runtime profiling, virtualized list tuning, WebSocket fanout/load checks. |
| P2 | UI/art direction | Restrained enterprise UI with smooth chat interactions; avoid decorative marketing layouts. |

## Current Increment: Webhook Security + Usability

Status: verified for the webhook redaction/admin UI slice. Plaintext secret hashing and browser e2e remain next tasks.

- [x] Backend `webhook_create` returns the generated secret once to the creator.
- [x] Backend `webhook_list` requires group owner/admin role.
- [x] Backend `webhook_list` redacts secrets and `store.Webhook` uses `json:"-"` for `Secret`.
- [x] Frontend group info panel can create, list, copy, and delete group webhooks.
- [x] Frontend stores the one-time secret separately from the redacted webhook list.
- [x] Added backend regression tests for create/list/admin authorization.
- [x] Added frontend store and panel tests for one-time secret handling and webhook management.
- [x] Added dedicated webhook integration documentation.
- [ ] Replace plaintext webhook secrets in SQLite with hashed secrets.
- [ ] Add end-to-end browser smoke for webhook create -> HTTP POST -> group message.

## Next Product Tasks

1. Group video call browser smoke/e2e with two sessions or a mocked WebRTC/media boundary.
2. Message input parity: up-arrow edit last message, slash commands, emoji shortcode expansion.
3. Message list polish: date separators, timestamp hover, smoother new-message and conversation-switching transitions.
4. Admin/security surface: 2FA plan, admin dashboard, audit log design, invite-code management hardening.
5. Performance pass: message list profiling, bundle/chunk review, WebSocket fanout/load check.
6. AgentHub feedback note: summarize which webhook/group/call primitives should migrate to AgentHub Hub APIs.

## Verification Ledger

Record commands here when they are run for the current increment.

| Date | Command | Result |
|---|---|---|
| 2026-05-23 | `cd backend; go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin)"` | PASS |
| 2026-05-23 | `cd backend; go test ./...` | PASS |
| 2026-05-23 | `cd frontend; npm test -- --run src/stores/chatStore.test.ts src/components/GroupInfoPanel.test.tsx` | PASS |
| 2026-05-23 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-23 | `cd frontend; npm test` | PASS, 13 files / 196 tests |
| 2026-05-23 | `cd backend; go test ./...` | PASS |
| 2026-05-23 | `git diff --check` | PASS |
| 2026-05-23 | Searched for stale references to the removed transfer document, excluding `node_modules`, `.git`, and `.worktrees` | PASS, no matches |

## Review Gates

Before committing or handing off meaningful changes:

- [x] `git diff --check`
- [x] `cd backend && go test ./...`
- [x] `cd frontend && npx tsc --noEmit`
- [x] Focused frontend/backend tests relevant to touched files
- [x] Docs updated for protocol, security, user-facing behavior, and AgentHub validation notes
- [x] `tmp_*` or unrelated local files are not staged

## Completed Baseline

- Core chat: public room, DMs, groups, friends, reactions, online status, typing.
- Data integrity: SQLite persistence, offline DMs, reactions in history, message caps, scoped typing.
- IM polish: unread badges, drafts, scroll memory, search jump, forwarding, streaming throttle, Chinese mentions, CSP/XSS hardening.
- Power features: read receipts, last seen, @mention notifications, notification sounds, blocking, file sharing.
- Advanced IM: pins/bookmarks, group invite flow, threaded replies, scoped search, infinite history, typing preview, custom emoji.
- Platform: PWA shell, frontend unit tests, backend WebSocket/store tests, accessibility baseline, Bot/Agent mention routing.
