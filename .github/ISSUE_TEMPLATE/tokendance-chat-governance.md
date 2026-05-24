---
name: TokenDanceChat governance
about: Track OIDC, PWA/i18n, design-system, packaging, or AgentHub validation work
title: "Governance: "
labels: governance
assignees: ""
---

## Goal

Describe the chat demo or AgentHub validation improvement.

## Area

- [ ] TokenDance ID OIDC session behavior
- [ ] PWA / offline / public preview
- [ ] zh/en i18n parity
- [ ] Design tokens / `--td-*`
- [ ] AgentHub validation surface
- [ ] README / docs / `llms.txt`

## Acceptance Criteria

- [ ] OIDC changes keep social providers inside TokenDance ID.
- [ ] Server-backed token validation documents issuer, audience, expiration, and JWKS behavior.
- [ ] PWA and error/empty states are covered in zh/en where user-facing.
- [ ] UI changes use local tokens or `--td-*`; chat-specific blue remains intentional.
- [ ] `frontend/public/robots.txt`, `sitemap.xml`, and `llms.txt` remain current if public routes or positioning change.

## Evidence

List tests, screenshots, or docs proving completion.
