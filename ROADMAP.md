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

## Current Increment: Media Storage + Screenshot-Driven UI Acceptance

Status: implemented, documented, tested, and accepted with browser screenshots.

- [x] Added S3-compatible `MediaStore` support with AWS SigV4 signing and env-driven configuration.
- [x] Kept S3 behind same-origin `/uploads/...` routes so frontend state never sees bucket URLs or credentials.
- [x] Moved custom emoji upload/serve paths onto the shared `MediaStore` abstraction.
- [x] Hardened media keys to reject empty segments, `.`, `..`, and traversal before local/WebDAV/S3 access.
- [x] Added focused backend tests for S3 PUT/GET, emoji media storage, emoji serving, and traversal rejection.
- [x] Documented production-server/S3-compatible deployment shape without private hostnames, buckets, keys, ports, or logs.
- [x] Made light mode the default first-run posture for Feishu/Lark-style acceptance.
- [x] Reworked mobile composer so Markdown tools collapse behind an icon and the textarea stays usable.
- [x] Added `docs/visual-acceptance.md` with screenshot metrics and a `gpt-image-2` reference prompt.
- [x] Added `npm run visual:acceptance` for desktop/tablet/mobile light/dark screenshots and JSON metrics.
- [x] Fixed production static assets being counted against REST API rate limits; `/api/...` remains limited, static SPA assets do not.
- [x] Completed Playwright screenshot review for desktop, tablet, and mobile light/dark mode.
- [x] Moved the desktop layout breakpoint from `md` to `lg` after screenshots showed a 768px tablet textarea squeezed to 144px; final tablet textarea is 456px.
- [x] Moved mobile secondary actions into a more menu so `公共聊天` stays readable instead of clipping to `公...`.
- [x] Tightened mobile message density: smaller mobile bubble text, narrower bubble padding, reduced transcript/date-separator padding, and no duplicated non-own bottom timestamp.
- [x] Hardened `npm run visual:acceptance` so seeded messages wait past the input send guard and fail fast if fewer than 4 acceptance messages are present.
- [x] Added visual hard gates for mobile title clipping, mobile message font size, and minimum visible message density.
- [ ] Continue density cleanup for message action buttons, header overflow at narrower desktop widths, sidebar above-the-fold utility, and remaining tiny metadata.

## Next Product Tasks

1. Group video call browser smoke/e2e with two sessions or a mocked WebRTC/media boundary.
2. Replace plaintext webhook secrets in SQLite with hashed secrets.
3. Add browser/e2e coverage for webhook create -> HTTP POST -> group message.
4. Message input parity: up-arrow edit last message, slash commands, emoji shortcode expansion.
5. Message list polish: date separators, timestamp hover, smoother new-message and conversation-switching transitions.
6. Admin/security surface: 2FA plan, admin dashboard, audit log design, invite-code management hardening.
7. Performance pass: message list profiling, bundle/chunk review, WebSocket fanout/load check.
8. AgentHub feedback note: summarize which webhook/group/call/media primitives should migrate to AgentHub Hub APIs.

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
| 2026-05-23 | `cd frontend; npm test` | PASS, 13 files / 196 tests |
| 2026-05-23 | `cd backend; go test ./handler -run "Test(RateLimitMiddleware|ShouldRateLimitAPI|WSAllow)$"` | PASS |
| 2026-05-23 | `cd frontend; npm test -- --run src/components/ChatLayout.test.tsx src/components/Sidebar.test.tsx src/components/ChatInput.test.tsx` | PASS, 3 files / 74 tests |
| 2026-05-23 | `cd frontend; npm run build` | PASS |
| 2026-05-23 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-23 | `cd backend; go test ./...` | PASS |
| 2026-05-23 | `cd frontend; VISUAL_BASE_URL=http://127.0.0.1:8091 npm run visual:acceptance` | PASS. Screenshots and metrics in `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-22T18-52-21-915Z`; final metrics: desktop textarea 816px, tablet 456px, mobile 208px, no horizontal overflow, no console errors. |
| 2026-05-23 | `cd frontend; npm test -- --run src/components/ChatLayout.test.tsx src/components/ChatInput.test.tsx` | PASS, 2 files / 40 tests |
| 2026-05-23 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-23 | `cd frontend; npm run build` | PASS |
| 2026-05-23 | `cd frontend; VISUAL_BASE_URL=http://127.0.0.1:8091 npm run visual:acceptance` | PASS. Screenshots and metrics in `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-22T19-36-55-386Z`; final metrics: desktop/tablet/mobile all show 4 seeded messages, mobile title 202px unclipped, mobile message font 13.5px, mobile textarea 208px, no horizontal overflow, no console errors. |
| 2026-05-23 | `cd frontend; npm test` | PASS, 13 files / 197 tests |

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
