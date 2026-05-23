# deploy -- TokenDanceChat deployment SOP

Reusable SOP for deploying TokenDanceChat to production servers. Covers two deployment targets: Docker (recommended) and systemctl (legacy). All commands run from the project root. Use placeholders for all server-specific values -- no real hostnames, IPs, or container names.

---

## 1. Pre-deploy checklist

Run before every deploy. Must all pass.

```powershell
# Full verification suite
.\scripts\verify.ps1

# Security leak scan (must produce zero output)
git grep -n -E '\b(hk1|hk2|us1|us2|us3|gz1)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E ':(3221)\b' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git grep -n -E 'password.*[0-9]{4,}|sk-[a-zA-Z0-9]{20,}' -- ':!.git' ':!node_modules' ':!AGENTS.md'
git log --oneline --all --grep='hk1|hk2|3221'

# Whitespace hygiene
git diff --check

# Confirm working tree is clean (no untracked secrets or debug artifacts)
git status
```

If any security scan produces output: stop, remediate, do NOT deploy.

---

## 2. Build

Build both artifacts locally. The backend is cross-compiled for Linux amd64.

### One-liner

```bash
bash scripts/build.sh
```

### Step-by-step

```bash
# Frontend
cd frontend
npm ci
npm run build

# Backend (cross-compile Linux amd64, stripped)
cd backend
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o tokendancechat .
```

Output artifacts:
- Binary: `backend/tokendancechat` (statically linked Linux amd64)
- Frontend: `frontend/dist/`

---

## 3. Docker deployment (recommended)

Two sub-approaches: **Docker cp** (for servers where `docker build` is disabled) and **Docker build** (for servers where build is allowed). Both deploy to the same container runtime image (`Dockerfile.runtime`, Alpine 3.21).

### 3.1 Container anatomy

```
Container: <container-name>
  Binary:    /app/tokendancechat      (owner: appuser, uid 996)
  Frontend:  /app/frontend/dist/      (owner: appuser)
  Data:      /app/data/chat.db        (owner: appuser, volume-mounted from <data-volume>)
  Port:      <app-port>               (default 8080, derived from CHAT_ADDR)
  Secrets:   via --env-file <secrets-file>
  Health:    wget http://127.0.0.1:<app-port>/api/health (every 30s)
```

Host paths (examples, vary by server):
| Host path | Purpose |
|-----------|---------|
| `<data-volume>` | Persistent SQLite + uploads, mounted to `/app/data` |
| `<secrets-file>` | Environment file with API keys and credentials |

### 3.2 Docker cp approach (docker build disabled)

Use when the server cannot run `docker build` (restricted Docker socket, no BuildKit). Build artifacts locally, upload, then update the running container via `docker cp`.

```bash
HOST="<user>@<host>"
CONTAINER="<container-name>"

# --- Upload artifacts ---
scp backend/tokendancechat "$HOST:/tmp/tokendancechat"
ssh "$HOST" "mkdir -p /tmp/frontend-dist"
scp -r frontend/dist/* "$HOST:/tmp/frontend-dist/"

# --- Update binary ---
ssh "$HOST" "docker cp /tmp/tokendancechat $CONTAINER:/app/tokendancechat"
ssh "$HOST" "docker exec -u root $CONTAINER chmod +x /app/tokendancechat"

# --- Update frontend ---
ssh "$HOST" "docker exec -u root $CONTAINER rm -rf /app/frontend/dist/*"
ssh "$HOST" "docker cp /tmp/frontend-dist/. $CONTAINER:/app/frontend/dist/"

# --- Restart ---
ssh "$HOST" "docker restart $CONTAINER"

# --- Verify (see Section 5) ---
ssh "$HOST" "sleep 3 && curl -s http://127.0.0.1:<app-port>/api/health"
```

### 3.3 Docker build approach (docker build allowed)

Use when the server has a working Docker daemon with BuildKit. Upload artifacts + Dockerfile.runtime, then `docker build` on the server. This produces a clean image with correct file ownership.

```bash
HOST="<user>@<host>"
CONTAINER="<container-name>"
IMAGE="<image-name>"

# --- Upload artifacts ---
scp backend/tokendancechat "$HOST:/tmp/tokendancechat"
ssh "$HOST" "mkdir -p /tmp/frontend-dist"
scp -r frontend/dist/* "$HOST:/tmp/frontend-dist/"
scp Dockerfile.runtime "$HOST:/tmp/Dockerfile.runtime"

# --- Tag old image for rollback (see Section 6) ---
ssh "$HOST" "docker tag $IMAGE:latest $IMAGE:previous 2>/dev/null || true"

# --- Build and replace container ---
ssh "$HOST" "
  cd /tmp &&
  docker build -f Dockerfile.runtime -t $IMAGE:latest . &&
  docker stop $CONTAINER 2>/dev/null || true &&
  docker rm $CONTAINER 2>/dev/null || true &&
  docker run -d --name $CONTAINER \
    --network host \
    -v <data-volume>:/app/data \
    -e CHAT_ADDR=:<app-port> \
    -e CHAT_DB_PATH=/app/data/chat.db \
    -e CHAT_FRONTEND_DIR=/app/frontend/dist \
    --env-file <secrets-file> \
    --restart unless-stopped \
    $IMAGE:latest
"

# --- Verify (see Section 5) ---
ssh "$HOST" "sleep 3 && curl -s http://127.0.0.1:<app-port>/api/health"
```

### 3.4 Frontend-only update (Docker)

When only frontend files changed (no backend binary changes). Faster -- no container restart needed.

```bash
HOST="<user>@<host>"
CONTAINER="<container-name>"

cd frontend && npm run build

ssh "$HOST" "mkdir -p /tmp/frontend-dist"
scp -r dist/* "$HOST:/tmp/frontend-dist/"

ssh "$HOST" "
  docker exec -u root $CONTAINER sh -c 'rm -rf /app/frontend/dist/*' &&
  docker cp /tmp/frontend-dist/. $CONTAINER:/app/frontend/dist/
"

# No restart needed -- frontend is static files served by the running binary.
# Verify the new frontend is reachable:
curl -s -o /dev/null -w '%{http_code}' "https://<host>/"
```

---

## 4. Systemctl deployment (legacy)

For servers running the binary directly under systemd without Docker. The binary and frontend live under a single directory on the host filesystem.

### 4.1 Server paths (systemctl)

| Path | Purpose |
|------|---------|
| `<remote-bin-dir>` | Binary directory, e.g. `/opt/tokendancechat` |
| `<remote-frontend-dir>` | Frontend dist, e.g. `<remote-bin-dir>/frontend/dist` |
| `<service-name>` | systemd unit name |

### 4.2 Full deploy

```bash
HOST="<user>@<host>"

# --- Stop service ---
ssh "$HOST" "systemctl --user stop <service-name> 2>/dev/null || sudo systemctl stop <service-name> 2>/dev/null || true"

# --- Upload binary ---
ssh "$HOST" "mkdir -p <remote-bin-dir>"
scp backend/tokendancechat "$HOST:<remote-bin-dir>/tokendancechat"
ssh "$HOST" "chmod +x <remote-bin-dir>/tokendancechat"

# --- Upload frontend ---
ssh "$HOST" "mkdir -p <remote-frontend-dir>"
rsync -avz --delete frontend/dist/ "$HOST:<remote-frontend-dir>/"

# --- Restart ---
ssh "$HOST" "systemctl --user restart <service-name> 2>/dev/null || sudo systemctl restart <service-name>"

# --- Verify (see Section 5) ---
ssh "$HOST" "sleep 3 && curl -s http://127.0.0.1:<app-port>/api/health"
```

---

## 5. Health check verification

Always run after deploy. If any check fails, roll back (Section 6).

### 5.1 Basic health

```bash
# HTTP health endpoint
curl -s "https://<host>/api/health"
# Expected: {"db":"ok","service":"tokendancechat","status":"ok"}

# HTTP status code only (for scripts)
curl -s -o /dev/null -w '%{http_code}' "https://<host>/api/health"
# Expected: 200
```

### 5.2 WebSocket smoke test

```bash
node -e "
const ws = new WebSocket('wss://<host>/ws');
ws.addEventListener('open', () => ws.send(JSON.stringify({type:'join', username:'smoke'+Date.now()})));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.type==='history') { console.log('WS OK'); ws.close(); process.exit(0); }
});
setTimeout(() => { console.log('WS FAIL (timeout)'); process.exit(1); }, 10000);
"
# Expected: WS OK
```

### 5.3 Container verification (Docker only)

```bash
ssh "<user>@<host>" "
  # Container must be running
  docker ps --filter name=<container-name> --format '{{.Status}}'
  # Expected: Up X seconds (healthy)

  # Health check must pass
  docker inspect <container-name> --format '{{.State.Health.Status}}'
  # Expected: healthy
"
```

### 5.4 Frontend asset verification

```bash
# Frontend must serve index.html (not 404, not empty)
curl -s -o /dev/null -w '%{http_code}' "https://<host>/"
# Expected: 200

# Static assets must be reachable (check a known asset path)
curl -s -o /dev/null -w '%{http_code}' "https://<host>/assets/"
# Expected: 200 or 404 (depending on Vite output structure; 403/500 is bad)
```

---

## 6. Rollback

### 6.1 Docker rollback

Before every deploy, the build approach (Section 3.3) tags the current image as `previous`. To roll back:

```bash
HOST="<user>@<host>"
CONTAINER="<container-name>"
IMAGE="<image-name>"

ssh "$HOST" "
  docker stop $CONTAINER &&
  docker rm $CONTAINER &&
  docker run -d --name $CONTAINER \
    --network host \
    -v <data-volume>:/app/data \
    -e CHAT_ADDR=:<app-port> \
    -e CHAT_DB_PATH=/app/data/chat.db \
    -e CHAT_FRONTEND_DIR=/app/frontend/dist \
    --env-file <secrets-file> \
    --restart unless-stopped \
    $IMAGE:previous
"

# Verify rollback
ssh "$HOST" "sleep 3 && curl -s http://127.0.0.1:<app-port>/api/health"
```

If the cp approach (Section 3.2) was used without tagging, roll back by re-deploying the previous binary from your local build cache or CI artifact store:

```bash
# Checkout the previous commit, rebuild, and re-deploy via cp approach
git checkout <previous-commit>
bash scripts/build.sh
# Then follow Section 3.2
git checkout -  # return to original branch
```

### 6.2 Systemctl rollback

Keep the previous binary before overwriting:

```bash
HOST="<user>@<host>"

# Before deploy, back up the running binary
ssh "$HOST" "cp <remote-bin-dir>/tokendancechat <remote-bin-dir>/tokendancechat.previous"

# To roll back:
ssh "$HOST" "
  systemctl --user stop <service-name> 2>/dev/null || sudo systemctl stop <service-name> &&
  cp <remote-bin-dir>/tokendancechat.previous <remote-bin-dir>/tokendancechat &&
  chmod +x <remote-bin-dir>/tokendancechat &&
  systemctl --user start <service-name> 2>/dev/null || sudo systemctl start <service-name>
"
```

### 6.3 Database safety

The SQLite database at `<data-volume>/chat.db` is NOT replaced during deploy. Docker volume mounts and systemctl directory paths both preserve the database across deploys. However:

- **Before any deploy that includes a backend binary change**: verify the new binary can open the existing database by checking the health endpoint's `db` field returns `"ok"`.
- **If a migration is needed**: the application handles SQLite migrations automatically on startup. If the health check shows `"db":"error"`, check container logs: `ssh "$HOST" "docker logs <container-name>"` or `journalctl -u <service-name> -n 50`.

---

## 7. Quick reference

| What | Command |
|------|---------|
| Pre-deploy verify | `.\scripts\verify.ps1` |
| Build both | `bash scripts/build.sh` |
| Build frontend only | `cd frontend && npm ci && npm run build` |
| Build backend only | `cd backend && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o tokendancechat .` |
| Docker cp deploy | Section 3.2 |
| Docker build deploy | Section 3.3 |
| Frontend-only Docker update | Section 3.4 |
| Systemctl deploy | Section 4.2 |
| Health check | `curl -s https://<host>/api/health` |
| Container health | `docker inspect <container-name> --format '{{.State.Health.Status}}'` |
| Rollback (Docker) | Section 6.1 |
| Rollback (systemctl) | Section 6.2 |
| Container logs | `docker logs <container-name>` |
| Systemctl logs | `journalctl -u <service-name> -f` |

---

## 8. Troubleshooting

### Container starts but health check fails

```bash
# Check container logs
ssh "$HOST" "docker logs <container-name> --tail 50"

# Check if port is bound correctly
ssh "$HOST" "docker exec <container-name> netstat -tlnp 2>/dev/null || docker exec <container-name> ss -tlnp"

# Verify frontend files exist inside container
ssh "$HOST" "docker exec <container-name> ls -la /app/frontend/dist/"
```

### Binary won't start (permission denied)

```bash
# Ensure binary is executable and owned by appuser (uid 996)
ssh "$HOST" "docker exec -u root <container-name> chmod +x /app/tokendancechat"
ssh "$HOST" "docker exec -u root <container-name> chown appuser:appgroup /app/tokendancechat"
```

### Frontend serves old assets after update

Browser caching. The frontend build produces hashed asset filenames, so old caches should naturally expire. If issues persist:

```bash
# Verify the newest assets are inside the container
ssh "$HOST" "docker exec <container-name> ls -lt /app/frontend/dist/assets/ | head"

# Force a hard reload in the browser: Ctrl+Shift+R
# Or clear the CDN/nginx cache if one sits in front of the app
```

### Database locked or corrupted

```bash
# Check DB health via the API
curl -s "https://<host>/api/health" | grep -o '"db":"[^"]*"'
# Expected: "db":"ok"

# If "db":"error", check container logs for the specific error
ssh "$HOST" "docker logs <container-name> 2>&1 | grep -i 'sqlite\|database\|migration'"

# Backup the database before any manual intervention
ssh "$HOST" "docker cp <container-name>:/app/data/chat.db /tmp/chat.db.backup.$(date +%Y%m%d-%H%M%S)"
```
