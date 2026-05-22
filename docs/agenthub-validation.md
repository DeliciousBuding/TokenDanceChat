# AgentHub Validation Notes

TokenDanceChat is an AgentHub validation project and playable demo.

It is not a separate product line competing with AgentHub. Its job is to make the AgentHub IM, Hub, realtime protocol, persistence, and web-client assumptions concrete before they are migrated or reimplemented in the main AgentHub repository at `D:\Code\AgentHub`.

## Why This Exists

AgentHub's target product is an IM-shaped multi-Agent collaboration platform:

```text
Desktop UI -> Edge Server -> Runner -> Claude Code / Codex / OpenCode
                   ⇅
              Hub Server
```

TokenDanceChat focuses on the IM and Hub-facing side of that system. It uses a normal chat product surface so the team can verify the hard parts with real UI pressure instead of only mock screens.

In practice, this means TokenDanceChat is both:

- a technical spike for AgentHub's chat, realtime, storage, and Agent interaction stack;
- a usable demo that people can play with while the main AgentHub P0 Desktop/Edge/Runner loop is still being built.

## What It Validates

| AgentHub question | TokenDanceChat validation |
|---|---|
| Can the Hub carry rich IM traffic over typed realtime events? | `backend/hub` and `frontend/src/lib/api.ts` exercise 40+ WebSocket message types for public chat, DMs, groups, reactions, calls, folders, scheduling, translation, and more. |
| Can a Go Hub Server stay simple enough for single-binary deployment? | The backend uses `net/http`, `gorilla/websocket`, and pure-Go `modernc.org/sqlite`, so it builds without CGO and deploys as one Linux binary. |
| Is SQLite + FTS5 enough for early Hub persistence? | `backend/store` persists users, messages, groups, DMs, reactions, reads, folders, custom emoji, call history, and search. |
| Does the React client model scale beyond a toy chat? | `frontend/src` uses React 19, Vite, Tailwind, Zustand, lazy-loaded panels, PWA assets, mobile gestures, and typed API helpers across a dense chat surface. |
| Can Agents feel like IM participants? | TokenBot and PicoClaw are exposed through @mentions, DM-like entry points, streaming replies, and model/provider UI. |
| Can external systems safely enter Hub conversations? | Group webhooks validate owner/admin control events, one-time high-entropy secrets, redacted lists, salted HMAC secret hashes, and constant-time HTTP ingress verification. |
| Can typed Hub role payloads drive client admin UX? | `group_info.group_members` carries owner/admin/member roles after a real WebSocket round trip, and the React client normalizes that payload before showing group admin and Webhook controls. |
| Can Hub media be externalized without changing the chat surface? | `backend/handler` keeps same-origin `/uploads/...` URLs while switching storage between local disk, WebDAV, and S3-compatible object storage for production-server-style deployment; the frontend never receives bucket URLs or storage credentials. |
| Which features are product polish versus platform primitives? | Chat folders, call rooms, message translation, GIFs, custom emoji, settings, and PWA behavior separate reusable platform patterns from demo-only polish. |

## Relationship To AgentHub

AgentHub owns the long-term product architecture:

- Desktop Command Center: local projects, threads, Agent runs, diff, approval, preview.
- IM Collaboration: single chat, groups, @Agent, Orchestrator, Reviewer, multi-Agent flow.
- Hub Network: accounts, contacts, groups, sync, relay, team memory.

TokenDanceChat validates mostly the second and third layers. It does not replace AgentHub's Desktop/Edge/Runner architecture, and it should not grow into a second authoritative architecture document.

Useful mapping:

| TokenDanceChat area | AgentHub destination |
|---|---|
| `backend/hub`, `backend/store` | `hub-server/` concepts and persistence patterns |
| `frontend/src/components`, `frontend/src/stores`, `frontend/src/lib/api.ts` | `app/web/` and `app/shared/` IM client patterns |
| WebSocket message handlers | `api/events.md` style typed-event thinking |
| `group_info.group_members` role normalization | Hub group-role event contract for owner/admin UI gates |
| Agent mention and DM surfaces | AgentHub P1 IM Collaboration experiments |
| Webhook create/list/delete and hashed ingress verification | Hub external-ingress and group-admin security contract |
| `MediaStore` local/WebDAV/S3 abstraction | Hub deployment and tenant media storage spike |
| Docker/single-binary deployment | Hub deployment spike, not the full Desktop P0 flow |

## Demo Boundary

Some features exist because a demo should be fun and credible:

- GIF/sticker/custom emoji;
- video and group calls;
- PWA offline shell;
- chat folders and archived/pinned conversation polish;
- translation and rich message actions.

These are useful pressure tests, but they are not all immediate AgentHub P0 requirements. When porting ideas back to AgentHub, prefer the proven primitives first: typed events, store contracts, conversation state, Agent-as-contact interaction, and recoverable UI state.

## How To Use This Repository

When continuing TokenDanceChat work, keep both goals in mind:

1. Preserve it as a working, playable chat demo.
2. Record which implementation lessons should feed AgentHub.

If a change is only demo polish, label it as such in docs or changelog. If it proves an AgentHub primitive, document the mapping so the main repository can reuse the lesson.
