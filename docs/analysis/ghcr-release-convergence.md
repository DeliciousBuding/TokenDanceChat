# GHCR Release Convergence Analysis

## Preliminary Direction
收敛 TokenDanceChat 的发布面：继续单镜像运行，统一 GHCR tag 规范，并让 compose、README、release checklist 与 CI/CD 一致。

## Current Architecture
TokenDanceChat 是 Go backend + React/Vite frontend 的单镜像应用。`Dockerfile` 已经把 frontend build 和 backend build 合并到一个 Alpine runtime 中，当前不需要拆分镜像。

## Technology Stack
| Layer | Current | Target |
|:--|:--|:--|
| Backend | Go | unchanged |
| Frontend | React + Vite | unchanged |
| Build | Docker multi-stage | unchanged |
| Registry | GHCR | `ghcr.io/tokendancelab/tokendance-chat` |
| Release | branch workflow + manual dispatch | branch + tag + manual dispatch |

## Entry Points
- `Dockerfile` builds the production image.
- `.github/workflows/cd-chat.yml` publishes GHCR image tags.
- `docker-compose.yml` runs local/compose deployments.

## Testing Baseline
- Backend: `cd backend && go test ./... && go build ./...`
- Frontend: `cd frontend && npm ci && npm test -- --run && npx tsc --noEmit && npm run build`
- Compose: `docker compose config`

## Project Governance Baseline
- Shared instruction surface: `AGENTS.md` exists but is bot identity focused.
- Claude-specific surface: none.
- Progress surface: this lightweight spec-driven run uses `docs/progress/MASTER.md`.

## S.U.P.E.R Summary
| Principle | Status | Finding |
|:--|:--|:--|
| S | 🟢 | One app image owns chat runtime. |
| U | 🟢 | CI builds image from source to GHCR; deploy pulls image. |
| P | 🟡 | Release contract is workflow/docs based, not schema based. |
| E | 🟢 | Runtime config remains env-driven. |
| R | 🟢 | Image tag can be swapped without changing source. |
