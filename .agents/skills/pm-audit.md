# pm-audit — TokenDanceChat PM UX audit SOP

Reusable SOP for auditing the frontend from a product/UX perspective. Designed for any agent to pick up and execute without project-specific onboarding. All paths relative to `frontend/src/`.

---

## 1. File checklist

Audit these files in order. The first pass is read-only; do not edit during audit.

### Core chat surface (highest traffic, audit first)

| File | What to check |
|------|---------------|
| `components/ChatLayout.tsx` | 3-panel layout, responsive breakpoints, panel resize behavior, empty-state placeholder when no conversation selected |
| `components/Sidebar.tsx` | Conversation list density, preview text truncation, unread badges, online indicators, search/filter, sort order, pinned vs archived separation |
| `components/MessageBubble.tsx` | Bubble styling per message type (text/image/file/poll/system), sender avatar/name grouping rules (same user within 2 min), timestamp placement, delivery status icons (sent/delivered/read), hover action menu (44px target), reply-to preview, edited indicator, reaction bar |
| `components/ChatInput.tsx` | Textarea auto-resize, submit on Enter (Shift+Enter for newline), attachment buttons (image/file/voice/emoji/GIF), @mention autocomplete, draft persistence, typing indicator broadcast, disabled state when no conversation, mobile toolbar collapse |

### Message interactions

| File | What to check |
|------|---------------|
| `components/MessageContextMenu.tsx` | Right-click/long-press menu completeness (copy/reply/forward/pin/edit/delete/select/translate/react), menu positioning near cursor, dismiss on scroll/click-outside |
| `components/MessageTranscript.tsx` | Multi-select mode, batch action bar (forward/delete), selection count display, exit-select affordance |
| `components/ForwardModal.tsx` | Conversation search, multi-select destinations, send confirmation, error feedback |
| `components/SystemMessage.tsx` | Join/leave/kick/pin/call system messages, visual distinction from user messages, i18n coverage |

### Media and rich content

| File | What to check |
|------|---------------|
| `components/FileMessage.tsx` | File icon by extension, file size display, download button, upload progress indicator, error state for failed uploads |
| `components/ImageLightbox.tsx` | Zoom (pinch on mobile, wheel on desktop), drag-to-dismiss, prev/next navigation, download button, loading skeleton, error fallback |
| `components/LinkPreview.tsx` | OG metadata extraction (title/description/image), loading state, broken-link fallback, tap target size on mobile |
| `components/PollMessage.tsx` | Option rendering, vote interaction, results display (percentage bars), closed-poll state |

### Panels and modals

| File | What to check |
|------|---------------|
| `components/UserProfileCard.tsx` | Avatar, display name, online status, last seen, action buttons (DM/mute/block), responsive (modal desktop, bottom-sheet mobile) |
| `components/GroupInfoPanel.tsx` | Member list, role indicators, group settings, webhook management, audit log, leave/delete group actions |
| `components/GroupCreateModal.tsx` | Name input validation, member selection, privacy setting, loading state during creation |
| `components/SettingsPanel.tsx` / `components/SettingsModal.tsx` | Notification prefs, theme toggle, language switcher, profile edit, data export, danger zone |
| `components/ThreadPanel.tsx` | Thread reply list, reply composer, back-to-main navigation, unread thread indicator |
| `components/AdminPanel.tsx` | User/group management tables, invite code list, server stats, pagination, search |
| `components/ScheduledMessagesPanel.tsx` | Scheduled message list, edit/cancel affordance, time display |

### Auth and onboarding

| File | What to check |
|------|---------------|
| `components/LoginScreen.tsx` | Form validation (empty fields, wrong credentials), error message i18n, loading state on submit, password visibility toggle, "forgot password" path |
| `components/RegisterScreen.tsx` | Username/password strength feedback, invite code field, duplicate-username error, success redirect |
| `components/JoinScreen.tsx` | Room list or direct-join flow, join error handling, loading state |

### Shared/primitives

| File | What to check |
|------|---------------|
| `components/Avatar.tsx` | Fallback initials, gradient generation consistency, online dot, size variants, loading state |
| `components/ErrorBoundary.tsx` | Fallback UI, retry button, error details (dev only), i18n |
| `components/ConfirmDialog.tsx` | Title/body/confirm/cancel contract, destructive variant (red confirm), keyboard (Escape to cancel, Enter to confirm) |
| `components/ScrollToBottom.tsx` | FAB visibility threshold, animation, z-index vs other overlays |
| `components/SearchBar.tsx` | Debounce, clear button, no-results state, keyboard shortcut (Ctrl+K) |
| `components/ThemeToggle.tsx` | Instant toggle, system-default detection, persistence |

### State and data layer

| File | What to check |
|------|---------------|
| `stores/chatStore.ts` | Loading/error/empty states for every async action, optimistic updates with rollback, stale data guards |
| `hooks/useWebSocket.ts` | Connect/disconnect/reconnect UX (toast or indicator), offline queue, heartbeat |
| `lib/api.ts` | Request timeout UX, retry logic, error message extraction from responses |
| `i18n/translations.ts` | Coverage check: every user-visible string must have zh-CN + en-US entries, no hardcoded Chinese/English strings in components |

---

## 2. UX dimensions

For each file above, evaluate against these dimensions. Not every dimension applies to every file — use judgment.

### 2.1 First-time experience (FTUE)
- What does a new user see after login with zero conversations?
- Are there empty-state CTAs (e.g., "Start a conversation", "Join a room")?
- Is onboarding self-explanatory or does it require external documentation?
- Are default settings sensible (notification prefs, theme, language)?

### 2.2 Information density
- Can the user scan the conversation list efficiently? (target: 6-8 visible conversations on desktop sidebar)
- Are timestamps, senders, and previews visually scannable?
- Is there unnecessary whitespace inflating scroll distance?
- Are long names/messages truncated with ellipsis (not mid-word wrap)?

### 2.3 Mobile responsiveness
- Do all interactive elements meet 44x44px minimum touch target? (per visual-acceptance baseline)
- Does the sidebar collapse to a full-screen overlay on narrow viewports?
- Are modals/bottom-sheets properly adapted for mobile?
- Is the soft keyboard handled correctly (no viewport push, input stays visible)?
- Are swipe gestures available where appropriate (reply, back, dismiss)?

### 2.4 Accessibility
- Do interactive elements have `aria-label` or visible text?
- Is focus management correct (trap in modals, return on close)?
- Are color-only indicators also conveyed via icons or text (online status, delivery status)?
- Is the tab order logical?
- Does `prefers-reduced-motion` disable non-essential animations?

### 2.5 Error states
- Network failures: is there a visible indicator (toast, banner, inline error)?
- API errors: are error messages user-readable (not raw HTTP status codes)?
- File upload failures: retry affordance, size/type validation messages?
- WebSocket disconnect: reconnect indicator, degraded-mode handling?
- Auth expiry: graceful redirect to login without data loss?

### 2.6 Empty states
- Zero conversations / zero messages / zero search results / zero group members?
- Is the empty state informative (icon + explanation + action) or just blank?
- Does the empty state match the visual language of the rest of the UI?

### 2.7 Loading states
- Initial load: skeleton screens or spinners? (skeletons preferred for layout stability)
- Lazy-loaded content: loading indicator near the triggered area (not full-page spinner)?
- Message send: optimistic insert or spinner until confirmed?
- Image/media: progressive loading (blur-up) or skeleton placeholder?

### 2.8 Performance perception
- Is the first paint fast? (no white screen flash, no layout shift from async fonts/images)
- Are there janky animations (non-composited properties, long paint frames)?
- Does infinite scroll feel responsive (pre-fetch threshold, no scroll-position loss)?
- Is the bundle loaded efficiently (code splitting, lazy routes)?

---

## 3. Comparison framework

For each dimension, benchmark against Telegram, Feishu/Lark, and WhatsApp. Use this table as a reference; in the audit report, call out specific deltas.

| Dimension | Telegram | Feishu/Lark | WhatsApp | Our target |
|-----------|----------|-------------|----------|------------|
| FTUE | Instant: phone-number auth, auto-populated contacts | Enterprise: org join first, then chat | Phone-number auth, auto-populated contacts | Web: register + invite code, then chat |
| Conversation density | ~10 items visible, compact rows | ~8 items, richer previews (docs, sheets) | ~9 items, compact | ~6-8 items, model preview cards + conversation rows |
| Message actions | Swipe-to-reply, long-press menu, double-tap reaction | Hover toolbar, right-click menu, reaction picker | Swipe-to-reply, long-press menu | Hover action menu (44px), right-click menu, reaction bar |
| Input | Single-line expandable, attachment clip, voice-note toggle | Rich toolbar (format, @, emoji, file, voice, schedule), slash commands | Single-line expandable, attachment clip, voice-note toggle | Multi-line textarea, collapsed toolbar on mobile, @mention |
| Media viewer | Full-screen, swipe between images, zoom, save | Full-screen, annotate, download, share | Full-screen, swipe, zoom, caption | ImageLightbox: zoom, drag-dismiss, prev/next |
| Delivery status | Single-check (sent), double-check (delivered), blue double-check (read) | Read/unread indicator per message | Single-check (sent), double-check (delivered), blue double-check (read) | Sent/delivered/read (matching Telegram checkmark style) |
| Empty state | "No chats yet" with illustration + start button | "No messages" with contextual CTA per module | "No chats" with start button | Room welcome with CTA |
| Offline | Cached messages, queued sends, "Connecting..." banner | Offline editing with sync, "Reconnecting" toast | Cached messages, queued sends, "Connecting..." banner | PWA offline cache, reconnect indicator |
| Accessibility | Screen reader support, font-size settings | Screen reader, high-contrast mode, font scaling | Screen reader, font-size settings | aria-labels, keyboard nav, reduced-motion |
| Typing indicator | "User is typing..." in chat list and chat view | "User is typing..." in chat view | "Typing..." in chat view + chat list | Bouncing dots in chat, "typing..." in sidebar preview |

Key gaps to flag:
- Any interaction that requires 3+ clicks/taps when Telegram does it in 1-2
- Missing feedback after an action (no toast, no animation, no state change)
- Desktop-only or mobile-only patterns that should work on both

---

## 4. Priority framework

| Priority | Definition | Examples |
|----------|-----------|----------|
| **P0** | Blocks core chat workflow for any user; data loss risk; security issue visible in UI | Send button unresponsive on mobile, messages appear out of order, login page infinite loop, crash on file upload |
| **P1** | Frustrates regular users daily; missing feature that competitors have and users expect; degrades on a primary screen size | No delivery status on messages, missing scroll-to-bottom button, empty state is blank white, mobile sidebar can't be dismissed, broken i18n string |
| **P2** | Nice-to-have polish; edge case; power-user feature; cosmetic | Animation jank on old devices, missing hover tooltip on obscure button, no slash-command autocomplete, date separator not implemented |

Apply the priority label to every finding. If unsure between P0 and P1, ask: "Does this prevent a user from sending or reading a message?" If yes, it is P0.

---

## 5. Output format

After auditing, produce a single markdown report. Use this exact table format:

```markdown
# PM UX Audit Report — YYYY-MM-DD

## Summary
- Files audited: N
- P0 issues: N
- P1 issues: N
- P2 issues: N
- Overall assessment: [1-paragraph verdict]

## Findings

| # | Priority | File | Component | Issue | Fix | Competitor benchmark |
|---|----------|------|-----------|-------|-----|---------------------|
| 1 | P0 | ChatInput.tsx | Send button | Button not visible below mobile keyboard when textarea expands beyond 3 lines | Constrain textarea max-height to viewport minus keyboard; auto-scroll input into view on focus | Telegram: input always stays above keyboard |
| 2 | P1 | Sidebar.tsx | Empty conversation list | Blank white panel when user has no conversations | Show illustrated empty state: "No conversations yet — join a room or start a DM" with CTA button | Feishu: contextual empty state per module |
| 3 | P2 | MessageBubble.tsx | Timestamp | Absolute timestamp shown instead of relative ("2026-05-23 14:30" instead of "3 minutes ago") | Use relative timestamps with absolute on hover; already implemented in utils.ts formatLastSeen — verify all call sites | Telegram: relative by default, absolute on tap/long-press |

## Dimension summary

| Dimension | Score (1-5) | Notes |
|-----------|-------------|-------|
| First-time experience | 3 | ... |
| Information density | 4 | ... |
| Mobile responsiveness | 3 | ... |
| Accessibility | 3 | ... |
| Error states | 3 | ... |
| Empty states | 2 | ... |
| Loading states | 3 | ... |
| Performance perception | 4 | ... |

## Quick wins (P1/P2, fixable in <1 hour)

- [ ] issue #X: [1-line description] — [estimated minutes]min
```

Scores: 1=broken, 2=below competitor baseline, 3=meets baseline, 4=exceeds baseline, 5=best-in-class.

---

## 6. Common issues — hit list

When auditing, these are the most frequent problem patterns. Check them first.

### Visual/interaction
- **44px touch target**: Buttons, links, and interactive icons smaller than 44x44px on mobile (per project visual-acceptance baseline)
- **Missing hover state**: Clickable elements with `cursor: pointer` but no `:hover` background/shadow change
- **No active/pressed state**: Buttons that don't visually depress on click/tap
- **Inconsistent border radius**: Different `rounded-*` classes on sibling elements (e.g., sidebar items with mixed `rounded-lg` and `rounded-xl`)
- **FOUC (Flash of Unstyled Content)**: Visible layout shift during font/icon load
- **Overflow hidden cutting off content**: Long usernames or group names truncated without tooltip
- **Z-index wars**: Modals, tooltips, context menus, and toasts fighting for stacking order

### State handling
- **Missing empty state**: Blank white area where a "no items" message should be
- **Missing loading state**: UI freezes without feedback during async operations
- **Missing error state**: Failed API call shows nothing (user thinks nothing happened)
- **Stale UI after action**: Optimistic update not rolled back on server error
- **Double-submit vulnerability**: No loading/disabled state on submit buttons during async operations

### i18n
- **Hardcoded strings**: Any Chinese or English text in JSX that should use `t('key')`
- **Missing en-US counterpart**: Key exists in zh-CN but not en-US (or vice versa)
- **Concatenated translations**: Building sentences from fragments (breaks word order across languages)

### Accessibility
- **Missing aria-label**: Icon-only buttons without accessible names
- **Div-as-button**: Clickable `<div>` without `role="button"`, `tabIndex`, and keyboard handlers
- **Color-only meaning**: Status indicators that rely solely on color (red/green) without icon or text alternative

### Mobile
- **Sidebar not dismissible**: No back button or swipe-to-close on mobile sidebar overlay
- **Modal overflow**: Modal taller than viewport without internal scroll
- **Fixed position elements overlapping soft keyboard**: FABs or bottom bars sitting on top of the keyboard

### Performance perception
- **No optimistic updates**: Message send shows a spinner until server confirms (Telegram shows the message instantly with a clock icon)
- **Scroll position lost**: Navigating away and back resets scroll to top instead of remembering position
- **Image layout shift**: Images load without reserved space, pushing content down
