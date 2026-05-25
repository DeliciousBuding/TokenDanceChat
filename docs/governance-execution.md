# TokenDanceChat Governance Execution

最后更新：2026-05-25

This file maps TokenDance system governance into TokenDanceChat execution items. TokenDanceChat is the AgentHub realtime/IM proving ground, not a separate long-term identity or platform product.

## Root Inputs

- `..\..\docs\ecosystem-execution-queue.md`
- `..\..\docs\governance-evidence-ledger.md`
- `..\..\docs\identity-auth.md`
- `..\..\docs\unified-login.md`
- `..\..\docs\authorization-model.md`
- `..\..\docs\security-risk-governance.md`
- `..\..\docs\agent-seo-i18n-packaging.md`
- `..\..\docs\i18n-parity-matrix.md`
- `..\..\docs\design-implementation-playbook.md`
- `..\..\docs\visual-qa-matrix.md`

## TokenDanceChat Queue Map

| Queue ID | Local owner area | Local files/docs to inspect | Minimum completion evidence |
|---|---|---|---|
| TD-P0-CHAT-01 | OIDC/session posture | `backend/handler/`, `backend/store/`, `frontend/src/lib/api.ts`, OIDC docs | Documented decision for durable OIDC session posture; tests for chosen behavior; README/API docs updated; no third-party provider token used as Chat permission |
| TD-P0-I18N-01 | PWA/offline/error/auth copy | `frontend/src/lib/i18n.tsx`, public files, PWA/offline UI | zh/en parity for login, errors, PWA/offline, webhook/admin, Relay copy; i18n scan or focused review evidence |
| TD-P0-DESIGN-01 | Chat UI and mobile surfaces | `frontend/src/components/`, `frontend/src/index.css`, `docs/visual-acceptance.md` | Screenshots for changed message list/composer/bot/error/empty state surfaces across desktop and mobile; text fit and no horizontal scroll |
| TD-P0-SEC-01 | Demo security/risk | `docs/security-risk-register.md`, webhook/session/upload/PWA code | Risk finding updated; Critical/High fixed, verified, or accepted before release-ready claims |

## Local Dispatch Rules

1. Chat uses TokenDance ID only as relying party identity; do not add direct GitHub, Google, or Feishu login.
2. Chat authorization is local: users, rooms/groups, admin flags, webhook ownership, media/upload rules, and bot actions.
3. Relay API keys, if introduced, must remain server-side and must not be exposed to browser state or public logs.
4. Public site files under `frontend/public/` must match README and root packaging rules.
5. UI polish claims require screenshots or `docs/visual-acceptance.md` evidence, not only component diffs.

## Sync Checklist

- Update `ROADMAP.md` for long-lived Chat execution choices.
- Update `docs/agenthub-validation.md` when a pattern should graduate back to AgentHub.
- Update `docs/security-risk-register.md` for session, webhook, upload, PWA, SSRF/CORS, Relay key, or bot action risk changes.
- Update root `authorization-model.md` if Chat changes product-local authorization semantics.
- Update `..\..\docs\governance-evidence-ledger.md` only when proof sources or missing proof change.
