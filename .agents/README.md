# TokenDanceChat Developer Agents

Specialized subagent configurations for the CI/CD pipeline.

## Roles

### merge-deployer
Handles git merge conflict resolution, build verification, and hk2 deployment.

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
Feature Branch (worktree) → Backend-dev/Frontend-dev builds
  → Code-reviewer reviews
    → Merge-deployer merges to master, builds, deploys to hk2
```

## Bot Reply Strategy

Decision: **@bot mention triggers reply always. Bot also auto-replies when:**
1. Message ends with `?` (question detection) — 30% chance
2. Message contains bot name without @ — 50% chance
3. Chat is idle for 2+ minutes and new message arrives — 10% chance
4. Message contains keywords: "help", "bot", "机器人" — 100% chance
