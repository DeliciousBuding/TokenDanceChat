# TokenDanceChat Developer Agents

Specialized subagent configurations for the CI/CD pipeline.

## Roles

### merge-deployer
Handles git merge conflict resolution, build verification, and production deployment.

### backend-dev
Go backend development: WebSocket protocol, SQLite store, LLM adapter, hub logic.

### frontend-dev
React/TypeScript frontend: components, stores, hooks, i18n, Tailwind styling.

### ux-designer
UI/UX polish: Telegram/Lark-style interactions, animations, responsive design, dark theme consistency.

### code-reviewer
Reviews code changes for correctness, security, performance, and style consistency.

## Workflow

```
Feature Branch → Backend-dev/Frontend-dev builds
  → Code-reviewer reviews
    → Merge-deployer merges to master, builds, deploys
```
