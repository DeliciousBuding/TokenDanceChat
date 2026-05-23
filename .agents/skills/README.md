# Project Skills

Reusable SOPs for TokenDanceChat development. Each skill is a self-contained markdown file that any agent can follow.

| Skill | Description |
|-------|-------------|
| [verify](verify.md) | Commit-gate checklist: quick verify, full verify, security leak scan, E2E |
| [pm-audit](pm-audit.md) | PM UX audit SOP: file checklist, UX dimensions, competitor comparison, priority framework, report format |
| [deploy](deploy.md) | Deployment SOP: Docker cp, Docker build, systemctl (legacy), health check, rollback, troubleshooting |

## Usage

Skills are invoked by the agent at decision points (pre-commit, pre-merge, code review). No manual invocation needed — the agent reads the relevant skill file and follows its SOP.
