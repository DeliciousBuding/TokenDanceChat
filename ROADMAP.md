# TokenDanceChat ROADMAP

## Phase 1: Core Stability ✅ COMPLETE
- [x] SSRF protection (HTTPS-only + redirect blocking)
- [x] WebSocket origin validation
- [x] Race condition fixes (PicoClaw TOCTOU, currentRoomID, username registration)
- [x] DM history leak prevention
- [x] Forward privacy (DM/group message blocking)
- [x] Deleted content sanitization (clear on read, block forward, filter search)
- [x] ErrorBoundary crash recovery

## Phase 2: Data Integrity ✅ COMPLETE
- [x] Groups/friends SQLite persistence (survive restart)
- [x] Offline DM delivery (GetUndeliveredDMs + delivered column)
- [x] Reactions persisted and enriched in history
- [x] Message cap (500) to prevent unbounded memory growth
- [x] Typing indicator context-aware scoping

## Phase 3: IM Polish ✅ COMPLETE
- [x] Per-conversation unread badges
- [x] Message drafts (localStorage persistence)
- [x] Scroll position memory per conversation
- [x] Search jump-to-message with highlight
- [x] Forward button wired up (ForwardModal)
- [x] Stream rendering throttled (80ms batching)
- [x] Chinese @mention support (Unicode regex)
- [x] CSP tightened, XSS in search fixed

## Phase 4: Power Features ✅ COMPLETE
- [x] Read receipts (broadcast mark_read to message sender)
- [x] Last seen display in sidebar/profile
- [x] @mention notifications across rooms
- [x] Notification sounds (Web Audio API)
- [x] User blocking (block list in DB)
- [x] File sharing beyond images (documents, archives)

## Phase 5: Advanced IM
- [x] Message pinning/bookmarks
- [x] Group invite accept/decline handshake
- [x] Message reply threading (already have reply_to, needs UI)
- [ ] Message search within conversation scope
- [x] Infinite scroll / pagination for history
- [ ] Typing indicator with message preview (like Telegram)
- [ ] Online/offline transition sounds
- [ ] Custom emoji / sticker support

## Phase 6: Platform
- [ ] PWA offline support (service worker + cache)
- [ ] Frontend unit tests (Zustand store, hooks, components)
- [ ] End-to-end WebSocket tests
- [ ] Performance profiling under load
- [ ] Accessibility audit (screen reader, keyboard nav)
