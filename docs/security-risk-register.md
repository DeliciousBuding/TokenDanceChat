# TokenDanceChat Security Risk Register

Last reviewed: 2026-05-25

TokenDanceChat is a demo and AgentHub stack validation app. The risk target is to keep it safe as a public demo while avoiding accidental drift into production identity or messaging infrastructure.

## Scope

- Backend REST/WebSocket/OIDC/media/webhook: `backend/`
- Frontend/PWA/service worker: `frontend/`
- Deployment and docs: `Dockerfile*`, `docker-compose.yml`, `docs/`, `README.md`, `SECURITY.md`

## P0 / High

| ID | Severity | Status | Risk | Evidence | Next action |
|---|---|---:|---|---|---|
| CHAT-SR-001 | High | Mitigated in repo; verify in deployment | WebSocket identity for registered local users is now bound to a server-issued app session token, while OIDC-linked usernames still require OIDC token validation and unknown usernames remain guest-only. | `backend/hub/client.go:324`, `backend/hub/hub.go:523`, `backend/handler/handler.go:86`, `backend/handler/handler.go:161`, `backend/store/store.go:2875`, `frontend/src/hooks/useWebSocket.ts:142`, `frontend/src/components/AuthModal.tsx:57`, `backend/hub/hub_test.go:504`, `backend/store/store_test.go:698`, `frontend/src/hooks/useWebSocket.test.ts:293` | Verify deployed `CHAT_SESSION_SECRET` stability, login/register WS join, guest join, and OIDC join in the target environment before closing. |
| CHAT-SR-002 | High | Mitigated in repo; verify in deployment | Authenticated search is now caller-aware. `/api/search` passes the authenticated session username to the store; the store filters deleted messages and limits global results to public messages, the caller's DMs, and groups where the caller is a member. | `backend/handler/handler.go:411`, `backend/hub/hub.go:70`, `backend/store/store.go:1023`, `backend/store/store.go:1027`, `backend/store/store_test.go:326`, `backend/handler/handler_test.go:1834` | Verify deployed search behavior against real public, DM, group, non-member group, and deleted-message fixtures before closing. |
| CHAT-SR-016 | High | Open | `/api/messages` remains unauthenticated public history scraping for the public message stream. It returns stored messages to any caller with only `limit` and `before` controls. | `backend/handler/handler.go:310`, `backend/handler/handler.go:331`, `backend/store/store.go:668`, `backend/store/store.go:680` | Decide whether public preview is intentional; otherwise require session and expose only caller-authorized public history. |
| CHAT-SR-017 | High | Open | Group export requires a session but not group membership. Any authenticated user can request `conversation=group:<name>` and export that group's messages. | `backend/handler/handler.go:942`, `backend/handler/handler.go:969`, `backend/handler/handler.go:993`, `backend/store/store.go:2104` | Add membership authorization before group export and regression tests for non-member denial. |
| CHAT-SR-003 | High | Partially mitigated; role policy open | Invite generation/listing now derives the creator from the authenticated session, but there is still no admin/role policy around who can mint invite codes. Any registered session can create invites unless product policy explicitly allows that. | `backend/handler/handler.go:1218`, `backend/handler/handler.go:1244`, `backend/handler/handler.go:1337`, `backend/handler/handler.go:1342`, `backend/handler/handler_test.go:2830` | Define invite ownership policy; add role checks or explicit self-service limits and tests. |
| CHAT-SR-004 | High | Partially mitigated; quota/retention open | Uploads now require a session and have request-size caps, but still act as authenticated public file hosting without per-user quotas, ownership checks on served files, or lifecycle cleanup. | `backend/handler/handler.go:578`, `backend/handler/handler.go:584`, `backend/handler/handler.go:589`, `backend/handler/handler.go:667`, `backend/handler/handler.go:673` | Add per-user quotas, lifecycle cleanup, served-file ownership/visibility rules, and release checks for upload disk growth. |
| CHAT-SR-005 | High | Open | Webhook secrets are passed in query strings and webhook body size is unbounded. Secrets can leak through logs/history/referrers and oversized JSON can consume memory. | `backend/handler/handler.go:1271`, `backend/handler/handler.go:1286`, `docs/webhook-integration.md:171` | Use `Authorization: Bearer` or HMAC signature headers, add `http.MaxBytesReader`, and cap content/username fields. |

## P1 / Medium

| ID | Severity | Status | Risk | Evidence | Next action |
|---|---|---:|---|---|---|
| CHAT-SR-006 | Medium | Open | OIDC transient state/token stores and provider calls lack hard capacity, response-size, and timeout bounds. Repeated login starts can grow memory; slow providers can hang goroutines. | `backend/handler/oidc.go:47`, `backend/handler/oidc.go:151`, `backend/handler/oidc.go:317`, `backend/handler/oidc.go:574` | Use bounded LRU stores, endpoint rate limits, `http.Client{Timeout}`, and response-size caps. |
| CHAT-SR-007 | Medium | Open | Link preview SSRF defenses validate DNS before fetch, but DNS rebinding can resolve public during validation and private during the actual dial. | `backend/handler/handler.go:346`, `backend/handler/handler.go:372`, `backend/handler/handler.go:794` | Use a custom `DialContext` that validates the final dialed IP and re-check redirects. |
| CHAT-SR-008 | Medium | Open | Group call room IDs function as bearer capability. Anyone with or guessing a room ID can join/list/relay SDP or ICE. | `backend/hub/client.go:2837`, `backend/hub/client.go:3058`, `backend/hub/client.go:3122`, `backend/hub/client.go:3171` | Enforce participant allowlists on join/list/signaling, use invite tokens/TTL, and cap participants. |
| CHAT-SR-009 | Medium | Open | Service worker caches successful GET API responses via `networkFirst`. Once auth is added, PII/API data can persist in Cache API across users on the same browser profile. | `frontend/public/sw.js:68`, `frontend/public/sw.js:84`, `frontend/public/sw.js:89` | Never cache `/api/*`; only cache static assets and offline shell. |
| CHAT-SR-010 | Medium | Open | CORS and WS origin allowlists match hosts, not exact origins, and allow `*`. Wildcard becomes dangerous once credentialed sessions exist. | `backend/handler/handler.go:118`, `backend/handler/ws.go:39`, `.env.example:4` | Parse configured values as exact origins including scheme/port; reject `*` in production. |
| CHAT-SR-011 | Medium | Open | OIDC docs/flow disagree on refresh token requirements. Login can fail or degrade when the provider does not issue a refresh token because frontend state expects both access and refresh tokens. | `backend/handler/oidc.go:324`, `frontend/src/App.tsx:64`, `docs/oidc-setup.md:102` | Request `offline_access` intentionally or support access-token-only login; frontend must not require refresh for initial WS auth. |
| CHAT-SR-012 | Medium | Verify | OIDC access/refresh tokens are currently held in Zustand memory, while localStorage keeps app auth markers and username. Future refresh persistence would change the threat model. | `README.md:172`, `docs/oidc-setup.md:70`, `frontend/src/stores/chatStore.ts:230`, `frontend/src/stores/chatStore.ts:369` | Keep refresh tokens memory-only unless switching to an HttpOnly app session; add regression that OIDC tokens are not written to localStorage. |
| CHAT-SR-013 | Medium | Verify | CSP allows `ws:` and `wss:` in `connect-src`, and inline styles remain allowed. The policy should be validated at runtime because meta CSP and server headers can diverge. | `frontend/index.html:9`, `SECURITY.md:59`, `SECURITY.md:23` | Keep runtime header checks in release validation and tighten `connect-src` when deployment stabilizes. |
| CHAT-SR-014 | Low | Open | Service worker cache strategy has been fixed before, but stale assets remain a recurring release risk for a PWA demo. | `AGENTS.md:73`, `AGENTS.md:211`, `ROADMAP.md:56`, `docs/handoff-report-2026-05-25.md:199` | Keep cache version changes in release checklist and verify HTML references the latest JS hash after deploy. |
| CHAT-SR-015 | Low | Open | Some docs still contain old local paths and deployment examples. They are not secrets, but they conflict with the workspace rule to avoid personal paths and live infra details in project docs. | `docs/visual-acceptance.md:60`, `deploy.md:22`, `scripts/deploy.sh:22` | Replace personal/local paths with workspace-relative examples and keep live deployment commands in the server workspace. |
| CHAT-SR-018 | Medium | Open | `/api/admin/stats` now requires a session, but has no admin role check. Any authenticated user can read operational counts and registered-user totals. | `backend/handler/handler.go:1309`, `backend/handler/handler.go:1315`, `backend/handler/handler.go:1318` | Add an admin/maintainer authorization concept before exposing admin endpoints beyond local demo use. |
| CHAT-SR-019 | Medium | Open | Webhook ingress accepts client-controlled sender names and broadcasts them into group chat. This enables sender spoofing and audit confusion. | `backend/handler/handler.go:1290`, `backend/handler/handler.go:1292`, `backend/handler/handler.go:1297` | Use a server-derived webhook display name or verified integration identity; store supplied sender as metadata only if needed. |
| CHAT-SR-020 | Medium | Open | Webhook ingress has no visible per-webhook rate limit. A valid webhook secret can spam group broadcasts and consume hub/store resources. | `backend/handler/handler.go:1259`, `backend/handler/handler.go:1276`, `backend/handler/handler.go:1305` | Add per-webhook and per-IP rate limits plus audit counters before broadcast. |

## Recent Mitigation Evidence

- 2026-05-25: `CHAT-SR-001` was mitigated in repo by adding local session tokens on login/register, registering the HTTP handler as the Hub's session verifier, checking `Store.UserExists` during WS join, and sending the session token from login/register UI paths.
- 2026-05-25: `CHAT-SR-002` was mitigated in repo by adding `SearchMessagesForUser`, wiring `/api/search` to the authenticated session username, filtering deleted messages in search, and adding store/handler regression coverage for private/deleted-result leakage.
- Fresh focused checks passed:
  - `cd backend; go test ./hub -run "TestHandleJoin(RequiresSessionTokenForRegisteredUser|RejectsWrongSessionTokenForRegisteredUser|AcceptsSessionTokenForRegisteredUser|AllowsGuestWithoutToken|RequiresTokenForOIDCUser)" -count=1`
  - `cd backend; go test ./handler -run "TestVerifySessionJoinToken|TestProtectedRESTRequiresSession|Test(Login|Register).*Session|Test.*OIDC" -count=1`
  - `cd backend; go test ./store -run "Test(UserExists|RegisterUser|VerifyUserBcryptUpgradeFlow)" -count=1`
  - `cd backend; go test ./store -run "TestSearchMessages(ForUserFiltersPrivateAndDeletedResults|SpecialCharacters|EmptyQuery|SQLInjection|NonExistentRoom|EmptyResults|Limit|VeryLongQuery|CJKAndEmoji)?$" -count=1`
  - `cd backend; go test ./handler -run "Test(SearchMissingQuery|SearchWrongMethod|SearchUsesAuthenticatedUserScope|ProtectedRESTRequiresSession)$" -count=1`
  - `cd frontend; npm test -- --run src/hooks/useWebSocket.test.ts src/components/AuthModal.test.tsx`

## Verification Queue

Run these from `D:\Code\TokenDance\tokendance-chat`:

```powershell
cd backend; go test ./handler ./hub ./store
cd ..\frontend; npm test -- --run src/App.test.tsx src/hooks/useWebSocket.test.ts src/lib/api.test.ts
rg -n "GetOIDCUserByUsername|msg.Token|setItem\(\"tokendance:auth\"|connect\(name" backend frontend
rg -n "GetMessages|Search|ExportMessages|AdminStats|InviteGenerate|InviteList" backend/handler
rg -n "UploadImage|ServeUpload|WebhookHandler|LinkPreview|isPrivateHost|OIDCLogin|http.Get|http.PostForm" backend/handler
rg -n "call_room|call_ice_candidate|CHAT_ALLOWED_ORIGINS|cache.put|isApiRequest" backend frontend .env.example
```

## Loop Notes

- Keep `SECURITY.md` for public summary and this file for the active audit queue.
- If Chat grows beyond demo scope, revisit identity/session, export/search authz, media retention, and WebSocket origin policy together.
