# cross-review -- TokenDanceChat code cross-review SOP

Reusable SOP for conducting structured code cross-reviews across backend and frontend. Designed for any agent to execute without project-specific onboarding. All commands run from the project root.

---

## 1. Pre-review checklist

Must all pass before starting the review. Run from repo root.

```powershell
# Ensure clean working tree
git status

# Ensure latest dev is pulled
git fetch origin dev && git log --oneline origin/dev..HEAD
# Expected: empty (we are up to date) or only local review-fix commits

# Full verification suite
.\scripts\verify.ps1

# Security leak scan (must produce zero output)
git grep -n -E '\b(hk1|hk2|us1|us2|us3|gz1)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E ':(3221)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E 'password.*[0-9]{4,}|sk-[a-zA-Z0-9]{20,}' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git log --oneline --all --grep='hk1|hk2|3221'

# Whitespace hygiene
git diff --check
```

If any security scan produces output: stop, flag as HIGH severity, do NOT commit until remediated.

---

## 2. Review dimensions checklist

For each file group (Section 3), evaluate against these 8 dimensions. Not every dimension applies to every file -- use judgment.

### 2.1 Security (HIGH impact)

| Check | What to look for |
|-------|-----------------|
| XSS vectors | `dangerouslySetInnerHTML` without sanitization; unsanitized server-sent snippets; `javascript:` / `data:` / `vbscript:` URIs in links |
| WebSocket origin check | Validate origin structurally with `url.Parse`, not suffix matching; reject malformed origins |
| Sandbox escapes | iframe `sandbox` attribute must NOT include `allow-same-origin`; PDF sandbox must be locked down |
| Auth bypass | Missing rate limiting on auth endpoints; register/login without brute-force protection; invite code generation without auth check |
| Secret exposure | Webhook secrets or API keys in list responses, DTOs, or log output; plaintext secrets in database |
| Input validation | FTS5 query injection; SQL column mismatch; unchecked user input in system commands |

### 2.2 Performance (MEDIUM-HIGH impact)

| Check | What to look for |
|-------|-----------------|
| Unbounded growth | Caches without max cap (linkPreviewCache, prependHistory); in-memory maps without periodic TTL cleanup |
| N+1 / O(n^2) scans | `dmPartners` scanning all messages instead of last N; `previewMap` scanning full array instead of slice(-200) |
| Goroutine leaks | Unbuffered channels causing send blocking; goroutine closure capturing stale loop variables; missing context timeout on agent/LLM paths |
| Bundle size | Unused dependencies in package.json; dead code imports pulling large libraries |
| DB query efficiency | Missing indexes on frequently filtered columns (to_user, group_name, delivered); FTS5 queries without column scoping |

### 2.3 Correctness (HIGH impact)

| Check | What to look for |
|-------|-----------------|
| Missing handlers | ReadPump switch cases without handler wiring (profile_update/get, status_update, poll_create/vote/close, block_list); dead code paths that should be active |
| SQL correctness | SELECT column count mismatching Scan() args; missing table in migration; schema drift between migration and runtime queries |
| Data races | Concurrent map read/write without lock; goroutine accessing shared state without synchronization; channel buffer mismatch (register vs unregister) |
| Stale state | Store state not reset on kick/logout; `isGuest` not reset on reconnect; conversation-switch not clearing scroll/load state |
| Race conditions | WebSocket close triggering reconnect during intentional disconnect; `onopen` timeout not cleared; scroll restoration vs live message arrival |

### 2.4 Accessibility

| Check | What to look for |
|-------|-----------------|
| aria-labels | Icon-only buttons without `aria-label`; aside/landmark elements without accessible names |
| aria-live regions | Transcript area without `aria-relevant="additions"`; dynamic content without live region announcements |
| Focus management | Modal open/close focus trapping; keyboard navigation order in sidebar; Escape to dismiss |
| Color contrast | Color-only status indicators (online/offline) without icon or text alternative |
| Screen reader text | Visually hidden labels for icon buttons; meaningful alt text on message attachments |

### 2.5 i18n

| Check | What to look for |
|-------|-----------------|
| Hardcoded strings | Any Chinese or English text in JSX/TSX not wrapped in `t('key')` |
| Inline ternaries | `lang === "zh-CN" ? "..." : "..."` pattern -- must use `t('key')` instead |
| Missing counterparts | Key exists in zh-CN but not en-US (or vice versa); untranslated keys |
| Error messages | Server error messages displayed raw to user instead of mapped to i18n keys |
| Concatenated translations | Sentences built from fragments (breaks word order across languages) |

### 2.6 State Management

| Check | What to look for |
|-------|-----------------|
| Missing initial state | New state fields in store type but missing in `getInitialState()` / `reset()` |
| Optimistic updates without rollback | UI updates before server confirmation without error-path undo |
| Stale UI after action | Action dispatched, server confirms, but UI does not reflect new state |
| Over-destructive reset | `disconnect()` clearing handlers/settings that should persist across reconnects |
| Typing state leaks | `typing_stop` not sent on unmount; typing indicator stuck after component teardown |

### 2.7 Error Handling

| Check | What to look for |
|-------|-----------------|
| Silent failures | API calls without `.catch()`; promise chains without error propagation; WebSocket send without connected check |
| Unguarded timeouts | `setTimeout`/`setInterval` without `clearTimeout`/`clearInterval` in useEffect cleanup |
| Missing abort | Fetch/API calls without AbortController cleanup on unmount; async operations that should cancel on conversation switch |
| Crash paths | SQL column mismatch causing runtime panic; nil pointer dereference in handler chains; type assertion without ok check |
| Feedback to user | Failed operations with zero UI feedback (no toast, no inline error, no state change); user left wondering "did it work?" |

### 2.8 UX Consistency

| Check | What to look for |
|-------|-----------------|
| Loading states | Skeleton or spinner during async operations; no white-screen flash between views |
| Empty states | Blank panels where informative empty states should be (zero conversations, zero search results) |
| Error states | Network failures with visible indicator (banner/toast); API errors with user-readable messages |
| Touch targets | 44x44px minimum for interactive elements on mobile |
| Duplicate renders | Same component rendered twice in the same tree (e.g., duplicate ConversationSearch in ChatLayout) |
| scrollIntoView | Using `scrollIntoView()` on messages -- cascades to ancestor scrollable elements; must use `container.scrollTo()` or `container.scrollTop` |

---

## 3. File groups to review together

Review these groups as cohesive units. Changes in one file within a group often affect the others. The groups are ordered by risk -- start with Group A.

### Group A: Message pipeline (highest traffic, review first)

| File | Why together |
|------|-------------|
| `frontend/src/components/ChatInput.tsx` | Message composition, send, typing indicator, MediaRecorder cleanup |
| `frontend/src/components/MessageBubble.tsx` | Message rendering, ReactMarkdown link sanitization, memo stability |
| `frontend/src/components/MessageTranscript.tsx` | Scroll management (scrollIntoView hazard), infinite scroll state, message grouping |
| `frontend/src/stores/chatStore.ts` | Central state: messages, unread, reactions, optimistic updates, reset on kick |

### Group B: Chat surface

| File | Why together |
|------|-------------|
| `frontend/src/components/ChatLayout.tsx` | 3-panel layout, conversation-switch effects, markRead wiring, search bar wiring, reconnect banner |
| `frontend/src/components/Sidebar.tsx` | Conversation list, previewMap scan scope, unread badges, scroll containers |
| `frontend/src/components/ScrollToBottom.tsx` | FAB visibility, new-message badge, scroll-to-bottom interaction with MessageTranscript |

### Group C: WebSocket + API layer

| File | Why together |
|------|-------------|
| `frontend/src/lib/api.ts` | WebSocket lifecycle, reconnect logic, exponential backoff, handler registration, intentional close |
| `frontend/src/hooks/useWebSocket.ts` | Connect/disconnect/reconnect UX, kicked handler, connection timeout, event dispatch |
| `backend/hub/client.go` | ReadPump switch completeness, WritePump ghost client cleanup, goroutine parameter capture, context timeout |
| `backend/hub/hub.go` | Register/unregister channel buffers, periodic TTL cleanup, concurrent map access, broadcast goroutine |
| `backend/handler/ws.go` | WebSocket upgrade, origin validation (structural parse, not suffix match), close frame format |

### Group D: Backend data layer

| File | Why together |
|------|-------------|
| `backend/store/store.go` | SQL schema, migrations, FTS5 queries, missing indexes, column-scan alignment |
| `backend/handler/handler.go` | REST handlers, auth rate limiting, webhook secret handling, media uploads |

### Group E: Auth + onboarding

| File | Why together |
|------|-------------|
| `frontend/src/components/LoginScreen.tsx` | Form validation, error-to-i18n mapping, auth rate limit feedback |
| `frontend/src/components/RegisterScreen.tsx` | Password strength, duplicate-username error, invite code validation |
| `frontend/src/components/JoinScreen.tsx` | Guest flow, room join error handling |
| `frontend/src/hooks/useWebSocket.ts` | Kicked handler state cleanup, isGuest reset |

### Group F: Modals + panels

| File | Why together |
|------|-------------|
| `frontend/src/components/GroupInfoPanel.tsx` | Member list, role checks, webhook management |
| `frontend/src/components/ForwardModal.tsx` | Message forwarding, conversation search, test selector fragility |
| `frontend/src/components/SearchBar.tsx` | XSS in snippets, dangerouslySetInnerHTML, i18n strings |
| `frontend/src/components/ConfirmDialog.tsx` | Destructive action guard, must be inside return (not early-return bypass) |
| `frontend/src/components/ErrorBoundary.tsx` | Fallback UI, retry button, error detail exposure in production |

### Group G: Shared utilities

| File | Why together |
|------|-------------|
| `frontend/src/i18n/translations.ts` | TranslationDict type coverage, zh-CN/en-US parity |
| `frontend/src/lib/utils.ts` | Shared sanitization (sanitizeContent), formatting, cn() usage |
| `frontend/src/lib/sound.ts` | Sound toggle, online/offline transition, cleanup |

---

## 4. Common bug patterns -- hit list

Based on actual bugs found in rounds 1-5. Check these first in every review.

### 4.1 scrollIntoView cascade (P0)

**Pattern**: `element.scrollIntoView()` anywhere in message/transcript code.

**Why it breaks**: `scrollIntoView()` cascades upward -- it scrolls every ancestor scrollable element until the target is visible. In a flex layout (ChatInput below MessageTranscript), this causes the entire page to scroll down, pushing ChatInput below the viewport.

**Real example** (Round 3): Messages loaded, `bottomRef.current.scrollIntoView({ behavior: "smooth" })` fired, ChatInput disappeared below the fold.

**Fix**: Replace with `containerRef.current.scrollTo({ top: containerRef.current.scrollHeight })` inside `requestAnimationFrame`. Never use `scrollIntoView()` for auto-scrolling a message list.

### 4.2 Missing `min-h-0` on flex children (P0)

**Pattern**: A flex child with `flex-1` and `overflow-y-auto` but no `min-h-0`.

**Why it breaks**: CSS flexbox defaults `min-height` to `auto` on flex children. This means the child cannot shrink below its content height, even with `overflow-y-auto` set. The container grows to fit all content and the overflow scroll never activates.

**Real example** (Round 4): `MessageTranscript` container had `flex-1 overflow-y-auto` but grew to full content height. Messages overflowed the viewport with no internal scroll.

**Fix**: Always pair `flex-1 overflow-y-auto` with `min-h-0` on the same element.

### 4.3 Unguarded timeouts and intervals (P1)

**Pattern**: `setTimeout` or `setInterval` in a component without cleanup in `useEffect` return.

**What to check**:
- `timerRef` / `debounceRef` -- must call `clearTimeout`/`clearInterval` in useEffect cleanup
- `MediaRecorder` -- must call `.stop()` on unmount
- Typing indicator -- must send `typing_stop` on unmount
- AbortController -- must call `.abort()` in cleanup
- WebSocket `onopen` timeout -- must clear on close/error

**Real example** (Round 1): ChatInput mounted, started MediaRecorder and typing interval, user navigated away, recorder kept running, typing indicator stuck for all other users.

**Fix**: Every `useEffect` that creates a timer or subscription must return a cleanup function that tears it down.

### 4.4 i18n bypass with inline ternaries (P1)

**Pattern**: `lang === "zh-CN" ? "中文" : "English"` anywhere in JSX.

**Why it breaks**: These strings are invisible to the i18n system. They cannot be audited, updated, or extended to new languages. They often get copy-pasted and diverge.

**Real example** (Round 3): SearchBar had `lang === "zh-CN" ? "未找到匹配的对话" : "No matching conversations"`. Same string existed in translations.ts as `searchEmpty`. The inline version was never updated when the i18n key changed.

**Fix**: Replace with `t("sidebar.searchEmpty")` and ensure both zh-CN and en-US entries exist in translations.ts.

### 4.5 Duplicate React keys and components (P1)

**Pattern**: Same component rendered twice in the same parent; `key` derived from non-unique data; missing key on mapped elements.

**Real example** (Round 1): `ChatLayout` rendered `<ConversationSearch>` twice -- once for sidebar search, once for in-conversation search. Both had identical keys and the second overrode the first in React's reconciliation.

**Fix**: When rendering the same component type multiple times, ensure distinct keys or different conditional renders. Use `key={`sidebar-${id}`}` and `key={`conv-${id}`}` patterns.

### 4.6 Missing aria-labels on icon-only controls (P2)

**Pattern**: `<button>` or clickable element with only an icon child and no text/aria-label.

**What to check**: Sidebar toggle, scroll-to-bottom FAB, close buttons, emoji picker trigger, attachment buttons, theme toggle.

**Real example** (Round 2): ScrollToBottom FAB had no aria-label. Screen readers announced "button" with no context.

**Fix**: Add `aria-label="Scroll to bottom"` (i18n-aware via `t()`).

### 4.7 WebSocket origin suffix bypass (P0)

**Pattern**: Origin check using `strings.HasSuffix` or similar substring matching.

**Why it breaks**: `https://evil.com/chat.example.com` passes a suffix check for `chat.example.com`.

**Real example** (Round 1): WS origin check used suffix matching. An attacker could host a page at a path ending with the allowed domain.

**Fix**: Use `url.Parse(origin).Host` and compare structurally. Reject if parsing fails.

### 4.8 Concurrent map read/write (P0)

**Pattern**: Reading from a Go map in one goroutine while another goroutine writes to it, without holding the mutex.

**Real example** (Round 2): `SendToGroup` iterated `h.members` without holding `groupsMu`. `RemoveGroupMember` wrote to the same map under lock. Concurrent iteration + write = fatal panic.

**Fix**: Copy the member set under lock before iterating. Use the copy for the broadcast loop.

### 4.9 Missing handler cases in ReadPump (P0)

**Pattern**: `switch msg.Type { case "message": ... }` without cases for all defined message types.

**Real example** (Round 1): Six handlers were defined in `client.go` (profile_update/get, status_update, poll_create/vote/close, block/unblock/block_list, group_invite_accept/decline, pin_message/unpin_message) but never wired into ReadPump's switch. The handlers existed as dead code.

**Fix**: Audit all handler function definitions against the ReadPump switch. Every defined handler must have a case. Use grep:
```powershell
# Find handler method definitions
rg "func \(c \*Client\) handle" backend/hub/client.go
# Then verify each one appears in ReadPump switch
```

### 4.10 SQL column-scan mismatch (P0)

**Pattern**: `db.Query("SELECT a, b FROM ...")` then `rows.Scan(&a, &b, &c)` -- column count mismatch.

**Real example** (Round 1): `GetPinnedMessages` SELECTed columns without `thread_id` but Scan() expected it. Caused runtime panic on any pinned message query.

**Fix**: Count columns in SELECT and verify exact match with Scan() args. Write a focused test for every new query function.

---

## 5. Severity classification

| Severity | Definition | Examples from our history | Action |
|----------|-----------|--------------------------|--------|
| **HIGH** | Data loss, security vulnerability, crash/panic, blocks core workflow | scrollIntoView cascade, WS origin bypass, SQL column mismatch, concurrent map read/write, missing min-h-0, ConfirmDialog outside return, go.mod invalid version, unbounded context.Background(), pdf sandbox escape | **Fix immediately**, run tests, create commit |
| **MEDIUM** | Functional bug, regression, user-visible breakage, performance degradation | Unguarded timeouts, i18n bypass ternaries, duplicate React keys, missing rate limiting on specific handler, stale state after kick, goroutine parameter capture race, debounceRef not cleaned up | File as task, fix in current sprint |
| **LOW** | Cosmetic, polish, dead code, minor inconsistency | Missing aria-labels, unused imports, dead code, debug console.log, hardcoded strings in non-i18n-covered locations, unstaged tmp files | Note for later, batch-fix when touching the file |

If unsure between HIGH and MEDIUM, ask: "Can this cause a crash, data loss, or security breach?" If yes, it is HIGH.

---

## 6. Output format

Produce a structured markdown report. Use this exact table format.

```markdown
# Cross-Review Report -- YYYY-MM-DD (Round N)

## Pre-review status
- Git status: clean / dirty (list untracked)
- verify.ps1: pass / fail (attach failures)
- Security scan: pass (0 output) / fail (list matches)
- Tests backend: N pass / M fail
- Tests frontend: N pass / M fail
- TypeScript: pass / fail (list errors)

## Scope
- Review focus: [e.g., "full stack", "frontend message pipeline", "backend auth flow"]
- Files reviewed: N
- File groups covered: A, B, C, ...

## Summary
- HIGH: N
- MEDIUM: N
- LOW: N
- Overall assessment: [1-paragraph verdict on code health and readiness]

## Findings

| # | Severity | File | Line(s) | Issue | Fix |
|---|----------|------|---------|-------|-----|
| 1 | HIGH | MessageTranscript.tsx | 262 | `scrollIntoView()` cascades to ancestor scrollable elements, pushing ChatInput off-screen | Replace with `container.scrollTo({ top: scrollHeight })` in `requestAnimationFrame` |
| 2 | HIGH | hub.go | 145 | `SendToGroup` iterates `h.members` without lock; concurrent `RemoveGroupMember` writes to same map | Copy member set under `groupsMu` lock before iterating |
| 3 | MEDIUM | ChatInput.tsx | 189 | `setInterval` for typing indicator never cleared on unmount | Add `clearInterval` in useEffect cleanup return |
| 4 | MEDIUM | SearchBar.tsx | 53 | Inline ternary `lang === "zh-CN" ? ... : ...` bypasses i18n | Replace with `t("search.empty")` and add key to translations.ts |
| 5 | LOW | ScrollToBottom.tsx | 38 | FAB button missing `aria-label` | Add `aria-label={t("a11y.scrollToBottom")}` |

## Dimension summary

| Dimension | Score (1-5) | Notes |
|-----------|-------------|-------|
| Security | 4 | ... |
| Performance | 3 | ... |
| Correctness | 3 | ... |
| Accessibility | 3 | ... |
| i18n | 3 | ... |
| State Management | 3 | ... |
| Error Handling | 3 | ... |
| UX Consistency | 4 | ... |

Scores: 1=broken (P0 issues present), 2=below baseline (multiple P1s), 3=meets baseline (minor issues), 4=exceeds baseline, 5=best-in-class.

## Quick wins (MEDIUM/LOW, fixable in <1 hour)

- [ ] #N: [1-line description] -- [est]min
```

---

## 7. Post-review actions

### 7.1 HIGH items -- fix immediately

1. Fix each HIGH issue in priority order (#1 first)
2. Run focused tests for the affected file groups:
   ```powershell
   # Backend
   cd backend && go test ./hub -count=1 && go test ./store -count=1 && go test ./handler -count=1
   # Frontend
   cd frontend && npm test -- --run
   ```
3. Run `npx tsc --noEmit` and `npx eslint .` (0 errors)
4. Commit with message: `fix: cross-review HIGH fixes -- <1-line summary of each>`
5. Push immediately

### 7.2 MEDIUM items -- file as tasks

1. Create tasks in the project task list with prefix `[MEDIUM]` and reference the review round:
   - `[MEDIUM] R5: Fix unguarded typing interval cleanup in ChatInput`
   - `[MEDIUM] R5: Replace i18n bypass ternaries in SearchBar`
2. Fix in current sprint / next working session
3. Batch related MEDIUM items into a single commit: `fix: address cross-review round N MEDIUM findings`

### 7.3 LOW items -- note for later

1. Record in ROADMAP.md under a "Polish backlog" section or note in the review report
2. Fix opportunistically when touching the affected file for other reasons
3. Batch multiple LOW items into a single commit: `chore: cross-review round N LOW polish items`

### 7.4 Round complete

After all HIGH and MEDIUM items are resolved:
1. Update ROADMAP.md if the review revealed architecture gaps
2. Update `docs/product-gap-analysis.md` if user-facing gaps were found
3. Commit the review report itself to `docs/cross-review/round-N.md` (optional, for historical record)

---

## 8. Quick reference: review command map

| What | Command |
|------|---------|
| Full verify | `.\scripts\verify.ps1` |
| Backend tests only | `cd backend && go test ./...` |
| Frontend tests only | `cd frontend && npm test -- --run` |
| TypeScript check | `cd frontend && npx tsc --noEmit` |
| ESLint | `npx eslint .` |
| Security scan | 3x `git grep` in Section 1 |
| Find all handler defs | `rg "func \(c \*Client\) handle" backend/hub/client.go` |
| Find all scrollIntoView | `rg "scrollIntoView" frontend/src/` |
| Find all dangerouslySetInnerHTML | `rg "dangerouslySetInnerHTML" frontend/src/` |
| Find all inline lang ternaries | `rg "lang\s*===\s*\"zh-CN\"\s*\?\s*.+:" frontend/src/` |
| Find all setTimeout w/o cleanup | `rg "setTimeout|setInterval" frontend/src/components/` (manually verify each has cleanup) |
| Find missing aria-labels | `rg "<button(?![^>]*aria-label)[^>]*>" frontend/src/` (approximate, manual review) |
| Git diff for pending changes | `git diff --check` |
| Find duplicate components | Manual review of JSX tree in ChatLayout.tsx |

---

## 10. Multi-agent parallel review workflow (2026-05-24 refinement)

Based on successful cross-review sessions. Dispatch 4-5 agents simultaneously, each reviewing a different dimension. Agents run in background (`run_in_background: true`) and deliver results independently.

### Agent assignment matrix

| Agent # | Dimension | Model | Review target |
|---------|-----------|-------|---------------|
| 1 | Security + Correctness | opus | api.ts, sw.js, auth flow, WebSocket handlers |
| 2 | i18n + UX Consistency | explore | translations.ts, components, E2E tests |
| 3 | E2E Test Quality | explore | e2e/ directory, test helpers, selectors |
| 4 | Architecture + Contracts | opus | Cross-file dependencies, store contracts, typed events |
| 5 | Coverage + Dead Code | sonnet | Uncovered branches, unused imports, dead handlers |

### Review prompt template

```
Cross-review [DIMENSION] for recent commits. Read `.agents/skills/cross-review.md` for SOP.
Review these files: [FILE LIST]
Focus on: [SPECIFIC CHECKS]
Report issues with severity (HIGH/MEDIUM/LOW) and file:line. Under 300 words.
```

### Fix prioritization

1. **HIGH first**: runtime crashes, XSS, data loss, infinite loops — fix immediately
2. **MEDIUM**: type errors, dead code, missing i18n, fragile selectors — fix in batch
3. **LOW**: comment inaccuracies, style inconsistency — defer or skip

### Verification after fixes

```bash
cd frontend && npm test -- --run   # All unit tests must pass
cd frontend && npx tsc --noEmit    # Zero TypeScript errors
cd backend && go test ./...         # All backend tests pass
```

### Lessons learned

- **Cross-review finds bugs that unit tests miss**: generation guards missing from 4/5 handlers, ReadReceipt `t` scope bug, VideoCall formatTime arity bug — all found by cross-review, zero by tests.
- **Subagents self-correct**: subagent A found `t` scope bug, subagent B independently fixed it while adding tests for the same file.
- **Skip failing subagent output rather than reverting entire batch**: 25 Sidebar tests passed, 17 context-menu tests failed → skip 17, keep 25. Net positive.
- **VideoCall/WebRTC is inherently hard to unit test**: jsdom lacks `getUserMedia`, `RTCPeerConnection`, `AudioContext`. Browser E2E or component-harness testing would be more effective.
