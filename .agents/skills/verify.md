# verify — TokenDanceChat commit-gate checklist

Reusable SOP for verifying code before committing or merging. All commands run from the project root. No absolute paths — use `cd backend` / `cd frontend` relative to repo root.

---

## 1. Quick verification (single-file changes)

Use when you touched one or two files and want a fast sanity check before committing.

### Changed a backend file (`backend/...`)

```powershell
# Focused tests — replace <PackageOrTest> with the affected package or test name
cd backend
go test ./hub -run "<TestName>" -count=1
go test ./store -run "<TestName>" -count=1
go test ./handler -run "<TestName>" -count=1

# Build check (faster than full test suite)
go build ./...

# Whitespace hygiene from repo root
git diff --check
```

### Changed a frontend file (`frontend/...`)

```powershell
# Focused tests — replace with the affected test file
cd frontend
npm test -- --run src/stores/chatStore.test.ts

# Type check
npx tsc --noEmit

# Build check (catches bundler-only errors)
npm run build

# Whitespace hygiene from repo root
git diff --check
```

### Changed both

Run the backend and frontend quick checks above, then `git diff --check` once.

---

## 2. Full verification (before merging to master)

Run the full suite. No shortcuts.

### One-liner (recommended)

```powershell
.\scripts\verify.ps1
```

Flags:
- `-SkipVisual` — skip screenshot-based visual acceptance (use when backend is not running)
- `-SkipDocker` — skip Dockerfile build checks (use when Docker is unavailable)
- `-WithE2E` — also run Playwright E2E tests (requires built backend binary)

### Step-by-step equivalent

If `verify.ps1` is unavailable or you need to debug a specific step:

```powershell
# 1. Backend tests
cd backend
go test ./...

# 2. Frontend tests
cd frontend
npm test -- --run

# 3. TypeScript type check
cd frontend
npx tsc --noEmit

# 4. Frontend build
cd frontend
npm run build

# 5. Backend build
cd backend
go build -o backend.exe .

# 6. Git whitespace hygiene
git diff --check

# 7. Docker build checks (optional, skip with -SkipDocker)
docker build --check -f Dockerfile .
docker build --check -f Dockerfile.runtime .

# 8. Visual acceptance (optional, requires running backend at $env:VISUAL_BASE_URL)
cd frontend
npm run visual:acceptance
```

### CI gate (what GitHub Actions runs)

The CI workflow (`.github/workflows/ci.yml`) runs on push/PR to `dev` and `master`:

```powershell
cd backend && go test ./...
cd frontend && npx tsc --noEmit && npm test -- --run
npx eslint .
git diff --check
```

ESLint must pass with **0 errors**.

---

## 3. Security leak check

Must produce **zero output** to pass. Run from repo root before every commit.

```powershell
# Server nicknames / SSH aliases
git grep -n -E '\b(hk1|hk2|us1|us2|us3|gz1)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'

# Internal ports
git grep -n -E ':(3221)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'

# Passwords and API keys (4+ digit password or sk- prefix tokens)
git grep -n -E 'password.*[0-9]{4,}|sk-[a-zA-Z0-9]{20,}' -- ':!.git' ':!node_modules' ':!AGENTS.md'

# Commit message leak audit
git log --oneline --all --grep='hk1|hk2|3221'
```

If any command produces output: stop, remediate, do NOT push. Remediation requires desensitizing the file(s) + `git filter-branch` history rewrite + force push (per AGENTS.md Section "红线").

---

## 4. E2E verification (protocol / UI changes)

Run when you changed WebSocket message types, API contracts, auth flows, or security-sensitive UI.

```powershell
# Via verify.ps1 (starts a temp backend, runs Playwright, tears down)
.\scripts\verify.ps1 -WithE2E

# Manual (if you need to inspect failures interactively)
cd frontend
npx playwright test --project=chromium --reporter=line
```

E2E tests cover:
- Login / register / kick-out
- Webhook create / list / audit / rotate-secret
- Group admin role checks
- Media upload and serve

Before running E2E, ensure a backend is running and `$env:E2E_BASE_URL` points to it.

---

## Quick reference: command map

| What | Command |
|------|---------|
| Full verify | `.\scripts\verify.ps1` |
| Full verify + E2E | `.\scripts\verify.ps1 -WithE2E` |
| Backend tests only | `cd backend && go test ./...` |
| Frontend tests only | `cd frontend && npm test -- --run` |
| Type check | `cd frontend && npx tsc --noEmit` |
| ESLint | `npx eslint .` |
| Security scan | 3x `git grep` above |
| Whitespace check | `git diff --check` |
| Build both | `cd backend && go build ./...` then `cd frontend && npm run build` |
