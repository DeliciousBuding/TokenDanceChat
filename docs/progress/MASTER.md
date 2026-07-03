# TokenDanceChat GHCR Release Convergence — Progress

> **Task**: 收敛 TokenDanceChat 的 GHCR/tag/compose 发布面。
> **Started**: 2026-07-03
> **Last Updated**: 2026-07-03 22:50
> **Mode**: LOCAL_ONLY
> **Repo**: TokenDanceLab/tokendance-chat

## References
- [Analysis](../analysis/ghcr-release-convergence.md)
- [Plan](../plan/ghcr-release-convergence.md)

## Phase Checklist
- [x] Phase 1: Release Surface Convergence (3/3 tasks)

## Current Status
**Active Phase**: Phase 1 complete locally  
**Active Task**: commit, push, confirm GHCR, then pull image on hk2  
**Blockers**: none

## Governance Status
**Shared instruction surface**: `AGENTS.md` exists; not modified because it is generated bot identity content.  
**Claude Code instruction surface**: unavailable.  
**Memory surface**: native conversation memory only; no repo fallback selected.

## Adaptive Control State
```yaml
adaptive:
  drift_score: 1
  strategy: "release-surface-convergence"
  thresholds:
    annotate: 1
    replan: 2
    rescope: 2
  total_tasks: 3
  completed_tasks: 3
  last_updated: "2026-07-03T22:50:00+08:00"
```

## Task Telemetry
| Task | Actual Effort | S.U.P.E.R Score | Unplanned Dependencies | Status |
|:--|:--|:--|:--|:--|
| GHCR semver workflow | S | 4/5 | 0 | done |
| Compose/docs alignment | S | 4/5 | 0 | done |
| Verification + hk2 pull | M | 4/5 | 1 (restored upload handler contract exposed by backend tests) | local verification done; hk2 pull pending GHCR publish |

## Execution Notes
- `cd-chat.yml` now supports branch, manual, and `vX.Y.Z` tag releases with `latest`, date, short SHA, `X.Y.Z`, and `X.Y` image tags.
- `docker-compose.yml`, README, and RELEASE now name `ghcr.io/tokendancelab/tokendance-chat:latest` as the compose/runtime image contract.
- Verification restored the existing `/api/upload` and `/uploads/{file}` backend contract through `MediaStore`, and updated `ChatInput` tests to match the current lightweight AgentHub composer.
- Local verification: `cd backend && go test ./... && go build ./...`; `cd frontend && npm test -- --run && npx tsc --noEmit && npm run build`; `CHAT_SESSION_SECRET=ci-compose-config-secret docker compose config`.
