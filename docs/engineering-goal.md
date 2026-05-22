# Engineering Goal

> For future agents and maintainers: keep TokenDanceChat moving as an AgentHub validation project and playable demo. Every change should either validate an AgentHub platform primitive, improve the demo quality without harming that validation goal, or reduce engineering risk.

## Active Goal

Advance TokenDanceChat as the Hub/IM validation surface for AgentHub while keeping it production-runnable as a demo.

This means:

- align architecture with AgentHub's Hub-Edge-Runner direction;
- keep the chat demo usable, polished, and deployable;
- prefer typed protocol contracts, tested store behavior, and recoverable UI state over one-off UI patches;
- document which lessons should feed back into `D:\Code\AgentHub`;
- verify every code change with focused tests plus build/type checks appropriate to the touched layer.

## Design Principles

1. **AgentHub first**
   TokenDanceChat validates AgentHub's IM collaboration and Hub network layers. It should not evolve into a separate product architecture.

2. **Playable demo second**
   The app should remain fun to use: DMs, groups, calls, emoji, GIFs, folders, translation, webhooks, and Agent chat are useful because they put realistic pressure on the platform.

3. **Typed realtime protocol**
   New realtime features should flow through explicit WebSocket message types, typed frontend API helpers, and store methods. Avoid hidden ad hoc event payloads.

4. **SQLite as early Hub truth**
   Persistence should stay explicit, migratable, and covered by store tests. If a feature changes durable state, define the table/store contract before broad UI work.

5. **Small verified increments**
   Prefer narrow changes with regression tests. For UI behavior, add Vitest coverage when practical; for protocol/store changes, add Go tests around the store, handler, or hub boundary.

6. **No sensitive operational leakage**
   Public docs can describe deployment shape, but not server IPs, internal ports, SSH details, credentials, or production data.

7. **Multimodal UI acceptance**
   Meaningful frontend polish must be checked with real browser screenshots and metrics. Generated `gpt-image-2` references can guide visual direction, but they are not acceptance evidence.

## Workstreams

| Priority | Workstream | Why it matters |
|---|---|---|
| P0 | Architecture/documentation alignment | Keeps future AgentHub porting work grounded and prevents TokenDanceChat from drifting into an unrelated chat product. |
| P0 | Protocol and store hardening | The WebSocket and SQLite contracts are the main reusable AgentHub evidence. |
| P0 | Verification baseline | A demo that cannot be tested or built reliably is weak evidence for AgentHub. |
| P1 | Agent-as-contact experience | Directly validates AgentHub's IM collaboration premise. |
| P1 | Group collaboration features | Groups, webhooks, calls, roles, and notifications pressure-test Hub semantics. |
| P1 | Frontend state and component cleanup | Large UI files are acceptable for spikes, but proven patterns should become easier to port into AgentHub. |
| P2 | Demo polish | Useful when it makes the demo credible; secondary when it does not validate platform assumptions. |

## Current High-Value Next Steps

1. Add browser-level smoke coverage for group video call setup with two sessions or a mocked media/WebRTC boundary.
2. Add webhook secret rotation and audit logging design before production use.
3. Split the largest UI surfaces only where tests or porting pressure justify it, starting with `MessageBubble.tsx` and `VideoCall.tsx`.
4. Add an AgentHub mapping note whenever a feature proves a reusable primitive, especially for WebSocket events, store interfaces, and Agent UX.
5. Keep `AGENTS.md`, README, ROADMAP, and `docs/agenthub-validation.md` synchronized after each milestone.

## Required Verification

Use the smallest command that proves the change, then run broader checks before claiming completion.

| Change type | Minimum verification |
|---|---|
| Go backend/store/protocol | `cd backend && go test ./...` |
| Frontend component/store/API | `cd frontend && npm test -- --run <focused test>` plus `npx tsc --noEmit` |
| Frontend build/runtime surface | `cd frontend && npm run build` |
| Frontend visual polish | `cd frontend && npm run visual:acceptance`, then review the screenshot output directory |
| Docs only | Link/path check by reading changed docs and `git diff --check` |
| Deployment | Health check after restart and a WebSocket/manual smoke relevant to the change |

## Decision Rule

When choosing between two next tasks, prefer the one that best satisfies this order:

1. fixes a correctness, security, or data-integrity risk;
2. strengthens an AgentHub-reusable primitive;
3. keeps the demo deployable and testable;
4. improves the user-facing demo experience;
5. reduces future maintenance cost.
