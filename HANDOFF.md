# TokenDanceChat — Project Handoff

> AgentHub 技术验证 Demo。基于 IM 形态的多 Agent 协作聊天平台。
> 上一次完整部署：2026-05-22 (Sprint 10 WIP)。仓库：`github.com/TokenDanceLab/TokenDanceChat`

---

## 1. 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Go 1.25, gorilla/websocket, modernc.org/sqlite (pure Go, no CGO), FTS5 |
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Zustand 5 |
| 实时通信 | WebSocket (40+ typed message handlers) |
| AI | PicoClaw agent + LLM fallback (glm-5 via `api.vectorcontrol.tech`) |
| 部署 | Docker on hk2 (核云 VPS), container `tokendancechat` |

---

## 2. 项目结构

```
TokenDanceChat/
├── backend/
│   ├── main.go              # HTTP + WS entry, route registration
│   ├── handler/handler.go   # REST handlers (health, upload, giphy, auth, export, emoji)
│   ├── hub/hub.go           # Hub: Store interface (50+ methods), Message struct, CallSession
│   ├── hub/client.go        # Client: 40+ WS message type handlers, translate, call rooms
│   ├── store/store.go       # SQLite: 20+ tables, all CRUD, FTS5 search, SHA-256 auth
│   ├── llm/llm.go           # Legacy LLM client (OpenAI-compatible)
│   ├── picoclaw/            # PicoClaw agent client
│   └── store/store_test.go   hub/hub_test.go hub/e2e_test.go handler/handler_test.go
├── frontend/
│   ├── src/
│   │   ├── components/      # 25+ components (see §4)
│   │   ├── stores/chatStore.ts  # Zustand: 50+ state fields, 70+ actions
│   │   ├── hooks/useWebSocket.ts # WS event handlers (40+ message types)
│   │   ├── lib/api.ts       # ChatAPI class: 60+ methods, WS + HTTP
│   │   ├── i18n/translations.ts # zh-CN + en-US, 30+ sections
│   │   └── index.css        # Tailwind + custom utilities/animations
│   └── public/              # sw.js (PWA), manifest.json, offline.html, icons
└── dist/                    # Build outputs (gitignored)
    ├── tokendancechat-server  # Go linux/amd64 binary
    └── index.html + assets/   # Vite frontend bundle
```

---

## 3. 后端架构要点

### Store interface (`hub/hub.go:54-188`)
50+ methods covering: messages, rooms, reactions, friends, groups (roles/admin), DMs, blocking, pinning, muting, archiving, threads, profiles, polls, notification prefs, scheduled messages, custom emojis, export, call history, user auth, invite codes, chat folders.

### Message types (40+ in `client.go` switch)
`join, message, reaction, message_edit, friend_request/accept/reject/list, mark_read, group_create/invite/accept/decline/message/join/kick/set_role/rename/transfer/leave/info, dm_message, message_delete, typing_start/stop, room_create/join/leave/list, forward, block/unblock/list, pin/unpin_message, pin/unpin_conversation, mute/unmute/archive/unarchive_conversation, load_history, thread_messages, notification_prefs_set/get, schedule/cancel_scheduled_message, scheduled_messages_list, call_start/accept/reject/end/ice_candidate/list, call_room_create/join/leave/list, custom_emoji_add/list/delete, folder_create/delete/rename/add_conversation/remove_conversation/list, translate_message`

### Auth
SHA-256 salted password hashing (`store.go:2055`). User registration requires invite code. HTTP endpoints: `/api/register`, `/api/login`.

### WebRTC Call Rooms (Sprint 10)
`CallRoom` struct in `hub.go:200-205`: ID, Participants, CreatedAt. Handlers in `client.go:3046-3196` for `call_room_create/join/leave/list`. Mesh topology: each peer connects to every other peer, SDP/ICE relayed through WebSocket.

---

## 4. 前端组件清单

| Component | Lazy | Description |
|-----------|------|-------------|
| ChatLayout | - | Main layout: sidebar + transcript + input + header |
| Sidebar | - | User list, DMs, groups, folders, pinned/archived |
| MessageTranscript | - | Virtualized message list with date separators |
| MessageBubble | - | Message rendering: markdown, GIF, sticker, voice, translate |
| ChatInput | - | Input with markdown toolbar, emoji autocomplete, @mentions, slash commands, GIF button |
| EmojiPicker | ✓ | Emoji grid with categories + custom emoji tab |
| CustomEmojiPicker | - | Upload/delete custom emoji overlay |
| GifPicker | ✓ | GIPHY search/trending overlay |
| VideoCall | ✓ | 1:1 + group WebRTC calls with grid layout, screen share (18.6KB chunk) |
| ThreadPanel | ✓ | Thread reply slide-in panel |
| GroupInfoPanel | ✓ | Group admin: members, roles, kick/promote/transfer |
| GroupCreateModal | - | Create group with member selection |
| ForwardModal | - | Forward message to user/DM |
| SettingsModal | ✓ | Unified settings: Profile/Appearance/Notifications/Data/Account (12KB chunk) |
| SettingsPanel | - | Per-conversation notification mute/preview |
| InviteCodeManager | ✓ | Generate/list invite codes |
| LoginScreen | - | Login form |
| RegisterScreen | - | Registration with invite code |
| JoinScreen | - | Guest join / login / register tabs |
| ConversationSearch | - | CTRL+F in-conversation message search |
| FileMessage | - | File cards with inline PDF/video/audio preview |
| LinkPreview | - | OG metadata link previews |
| PollMessage | - | Telegram-style poll with vote bars |
| Avatar | - | Avatar with initials fallback + online dot |
| ProfileEditModal | - | Display name, avatar, bio, status |
| ScheduledMessagesPanel | - | View/cancel scheduled messages |
| ScheduleButton | - | DateTime picker for scheduling |
| SearchBar | - | Global message search (FTS5) |
| ImageLightbox | ✓ | Full-screen image viewer |
| ThemeToggle | - | Dark/Light/System theme toggle |
| ConfirmDialog | - | Reusable confirmation dialog |
| MessageContextMenu | - | Right-click: copy, forward, delete, edit, pin |
| ErrorBoundary | - | React error boundary |

---

## 5. 关键状态 (chatStore)

```ts
// Core: messages, onlineUsers, rooms, friends, groups, blockedUsers
// Conversation: pinnedConversations, mutedConversations, archivedConversations, notificationPrefs
// Media: pendingImage, lightboxImage
// Social: userProfiles, selectedProfileUser, pendingFriendRequests, pendingGroupInvites
// Features: scheduledMessages, customEmojis, folders (ChatFolder[]), translations (Record<string,string>)
// Call: incomingCall, activeCall (with callId, roomId, isGroupCall, participants)
```

---

## 6. 构建与测试命令

```powershell
# Backend
cd D:\Code\Projects\TokenDanceChat\backend
go build ./...           # build check
go test ./...            # 6 suites: backend, handler, hub, llm, picoclaw, store
$env:GOOS='linux'; $env:GOARCH='amd64'; $env:CGO_ENABLED='0'; go build -o ..\dist\tokendancechat-server .

# Frontend
cd D:\Code\Projects\TokenDanceChat\frontend
npx tsc --noEmit         # type check
npx vite build           # production bundle → ../dist/
```

---

## 7. 部署 (hk2)

Server: hk2 核云 VPS. Container `tokendancechat`, host network mode, data at `/var/lib/agenthub/chat/`.

```powershell
# Copy binary
scp dist\tokendancechat-server hk2:/tmp/tokendancechat-server.new
ssh hk2 "sudo chmod +x /tmp/tokendancechat-server.new && sudo docker cp /tmp/tokendancechat-server.new tokendancechat:/app/tokendancechat"

# Copy frontend
scp -r frontend\dist\* hk2:/tmp/chat-frontend/
ssh hk2 "sudo docker exec tokendancechat rm -rf /app/frontend/* && sudo docker cp /tmp/chat-frontend/. tokendancechat:/app/frontend/"

# Restart
ssh hk2 "sudo docker restart tokendancechat"

# Verify
ssh hk2 "curl -s http://localhost:8080/api/health"
# → {"service":"tokendancechat","status":"ok"}
```

**SECURITY**: Server IPs, internal ports, SSH configs, container names — NEVER in git repo.

---

## 8. Sprint 完成状态

| Sprint | Features | Status |
|--------|----------|:------:|
| 1-5 | Basic chat, DM, groups, friends, reactions, online status, typing | ✓ |
| 6 | Threads, polls, profiles, notification prefs, markdown toolbar, link previews, file sharing, export, scheduled messages, group admin | ✓ |
| 7 | WebRTC 1:1 calls, GIF/stickers (GIPHY), custom emoji, invite code registration | ✓ |
| 8 | @all/@everyone mentions, chat folders, inline PDF/video preview, unified settings modal | ✓ |
| 9 | CTRL+F in-conversation search, lazy loading optimization, PWA verification, npm audit fix | ✓ |
| 10 | **Multi-party group call rooms, message translation, UI polish (partial)** | 🟡 |
| — | Webhook/bot system, 2FA, admin dashboard, group video call frontend polish | ❌ |

---

## 9. 当前 Sprint 10 进度详情

### ✅ 已完成
- **Message translation**: Backend handler `handleTranslateMessage` in `client.go`, sends to LLM, returns `translate_result`. Frontend: Translate button in MessageBubble context menu, inline translation display with blue background.
- **Multi-party call backend**: `CallRoom` struct, `call_room_create/join/leave/list` handlers, participant tracking, relay to all peers.
- **VideoCall frontend partial**: Multi-peer tracking (`peersRef` Map, `remoteStreamsRef` Map), grid layout CSS, group call room join/leave flow.
- **UI polish partial**: CSS focus rings, custom scrollbar, micro-animations in `index.css`.
- **TSC errors fixed**: `Record<string, unknown>` → `unknown` intermediate casts, unused variables removed.

### ❌ 未完成
- **Group video call frontend testing**: The VideoCall component has multi-peer support code but hasn't been tested end-to-end with multiple browsers.
- **"Group Call" button in ChatLayout**: Currently call buttons only show for DMs. Need to add for group chats.
- **UI polish**: Conversation switching crossfade, new message entrance animations, unread badge pulse not fully wired.
- **go.mod**: `golang.org/x/crypto v0.31.0` still in direct deps (legacy from bcrypt). Need `go mod tidy` when network available. The code no longer imports it.
- **Webhook/bot integration**: Not started.
- **2FA / Admin dashboard**: Not started.

---

## 10. 已知问题 / 注意事项

1. **go.mod crypto dependency**: `golang.org/x/crypto v0.31.0` is listed but unused (we use `crypto/sha256` stdlib). GitHub Dependabot flags 3 alerts on this. `go mod tidy` fails due to network proxy block. Solution: run `go mod tidy` with working Go proxy, or manually remove the `require` line and the `golang.org/x/crypto` entry from `go.sum`.

2. **MessageBubble.tsx is large** (~1400 lines): Contains GIF renderer, sticker renderer, voice player, translate display, reaction bar, context menu. Consider splitting into sub-components.

3. **VideoCall.tsx is complex** (~900 lines): 1:1 + group mesh WebRTC in one file. Peer grid, screen share, mobile support. Needs end-to-end testing with multiple real browsers.

4. **No E2E tests**: Only unit tests for backend (6 suites, all passing). No browser-based integration tests.

5. **Live deployment**: Always verify health check after deploy: `curl -s http://localhost:8080/api/health`.

---

## 11. 并行开发 — Codex Worktree 方案

```powershell
# Clone if needed
git clone https://github.com/TokenDanceLab/TokenDanceChat.git
cd TokenDanceChat

# Create worktrees for parallel features
git worktree add ../tdc-group-call        master   # Group video call frontend
git worktree add ../tdc-ui-polish         master   # UI polish + animations
git worktree add ../tdc-webhook           master   # Webhook/bot system
git worktree add ../tdc-security          master   # 2FA, security audit
git worktree add ../tdc-admin             master   # Admin dashboard
git worktree add ../tdc-perf              master   # Performance optimization

# In each worktree, launch Codex:
# codex --worktree ../tdc-group-call "Complete group video call frontend..."

# Merge back
cd TokenDanceChat
git merge tdc-group-call tdc-ui-polish tdc-webhook ...
```

**Important**: Only modify non-overlapping files. If two worktrees need the same file (e.g., `chatStore.ts`), coordinate merge order.

---

## 12. 父项目关联 (AgentHub)

TokenDanceChat 是 AgentHub (`D:\Code\AgentHub`) 的技术验证 Demo，映射关系：

| TokenDanceChat | AgentHub | 成熟度 |
|---------------|----------|:------:|
| `backend/hub/` | `hub-server/` | Demo-verified |
| `backend/store/` | `hub-server/` | Demo-verified |
| `frontend/src/` | `app/web/` + `app/shared/` | Demo-verified |
| Docker deploy | `hub-server/` + Edge | Manual |

AgentHub 仓库: `D:\Code\AgentHub`，README: `D:\Code\AgentHub\README.md`
