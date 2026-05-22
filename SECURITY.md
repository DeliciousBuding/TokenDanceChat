# Security Audit Report — TokenDanceChat

**Date**: 2026-05-21
**Scope**: Entire codebase (Go backend, React/TypeScript frontend, Docker deployment)
**Auditor**: Automated security review

---

## 1. Summary of Findings

| Severity | Count | Description |
|----------|-------|-------------|
| **HIGH** | 5 | Path traversal, missing security headers, root container, no connection limits, missing backend content validation |
| **MEDIUM** | 5 | CSWSH via open origin check, CORS wildcard, DB files in Docker image, unused rehype-raw dependency, webhook secret at-rest hardening |
| **LOW** | 5 | Hardcoded WS URL, username in localStorage, error log verbosity, no DB pool limits, Docker HEALTHCHECK now fixed |

**HIGH severity issues have been fixed in code.** See sections below for details.

**2026-05-23 webhook update**: Incoming webhook list responses require group owner/admin role and redact secrets. `webhook_create` returns a high-entropy secret only once to the creator, frontend state keeps that one-time secret separate from normal redacted webhook lists, and SQLite stores only versioned salted HMAC hashes. Legacy plaintext webhook rows are migrated to hashes when the store starts.

**2026-05-23 media update**: Uploads now share a `MediaStore` abstraction across local disk, WebDAV, and S3-compatible storage. Ordinary uploads and custom emoji both use safe relative object keys, reject traversal segments, and are served back through same-origin `/uploads/...` routes. production-server/S3 credentials must stay in private environment files.

**2026-05-23 deployment update**: Runtime Docker images now define a `HEALTHCHECK` against `/api/health`. The check derives its port from `CHAT_ADDR`, so deployments using non-default listeners such as `:3000` are still checked correctly.

---

## 2. Detailed Findings

### H-01: Path Traversal in Static File Serving [FIXED]

**Location**: `backend\main.go:38-44` (original lines)
**Description**: The SPA fallback handler resolved `r.URL.Path` through `filepath.Clean` + `filepath.Join`, which on Unix could resolve absolute paths (e.g., `/../../../etc/passwd` -> `/etc/passwd`). `http.Dir` provides some protection, but the `os.Stat` check probed arbitrary filesystem locations for existence, leaking file-existence information. On Windows, drive-relative paths posed an additional risk.
**Fix**: Added explicit containment verification using `filepath.Abs()` and `strings.HasPrefix()` to ensure the resolved path stays within the frontend distribution directory. Paths escaping containment now return 404.
**Status**: FIXED in `backend\main.go`.

---

### H-02: Missing Security Headers [FIXED]

**Location**: `backend\main.go` (middleware chain, original)
**Description**: The HTTP server sent no security headers:
- No `Content-Security-Policy` (risk of XSS via injected scripts)
- No `X-Content-Type-Options: nosniff` (MIME sniffing risk)
- No `X-Frame-Options` (clickjacking risk)
- No `Referrer-Policy` (referrer leakage)
- No `Permissions-Policy` (sensor/device access)

**Fix**: Added `SecurityHeadersMiddleware` in `backend\handler\handler.go` that sets:
- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'self'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-XSS-Protection: 0` (deprecated but set for defense-in-depth on older browsers)

The middleware is applied in the chain: Logging -> SecurityHeaders -> CORS.
**Status**: FIXED in `backend\handler\handler.go:59-72`, applied in `backend\main.go:50`.

---

### H-03: Docker Container Runs as Root [FIXED]

**Location**: `Dockerfile:35` (original), `docker-compose.yml`
**Description**: The Alpine runtime container ran the application as `root`. A code-execution vulnerability in the Go application (or a dependency) would yield root access inside the container, and potentially on the host if combined with a container breakout.
**Fix**: Created non-privileged `appuser:appgroup` in the Docker image. The `/app/data` directory is owned by this user so SQLite can write to it. The `USER appuser` directive ensures the process drops privileges before starting.
**Status**: FIXED in `Dockerfile:28-32`.

---

### H-04: No Global Connection Limit [FIXED]

**Location**: `backend\handler\ws.go:16-18` (original), `backend\hub\hub.go`
**Description**: There was no limit on concurrent WebSocket connections. An attacker could open hundreds or thousands of connections, each consuming a goroutine and memory (receive buffer, send buffer + channel), leading to resource exhaustion and denial of service.
**Fix**: Added `MaxConnections = 100` constant in `hub.go`. Added `IsFull()` method on Hub. The WebSocket handler in `ws.go` now rejects upgrade requests with HTTP 503 when the hub is at capacity, before even accepting the TCP connection upgrade.
**Status**: FIXED in `backend\hub\hub.go:15` and `backend\handler\ws.go:25-28`.

---

### H-05: No Backend Content Validation [FIXED]

**Location**: `backend\hub\client.go:144-156` (original)
**Description**: The backend only checked if content was empty (`msg.Content == ""`). There was no length limit enforced server-side. While the frontend caps input at 2000 characters via `maxLength={2000}`, this is trivially bypassed by a malicious WebSocket client sending oversized messages directly. This could bloat the SQLite database and consume excessive memory during JSON serialization/broadcast.
**Fix**: Added `sanitizeContent()` function that strips null bytes, trims whitespace, and enforces a 2000-rune maximum length. Applied before storage and broadcast in `handleChatMessage()`.
**Status**: FIXED in `backend\hub\client.go:263-277`.

---

### M-01: WebSocket Origin Check Allows All Origins

**Location**: `backend\handler\ws.go:16-18`
**Description**: `CheckOrigin` returns `true` for all origins. This enables Cross-Site WebSocket Hijacking (CSWSH) -- any website can open a WebSocket to the server and send/receive messages silently on behalf of a user. While intentional for a demo with no authentication, this should be restricted in production.
**Recommendation for production**: Check `Origin` header against a whitelist of allowed domains. For a single-domain deployment, verify `r.Header.Get("Origin")` matches the expected domain.
**Status**: ACCEPTED FOR DEMO. Documented in deploy.md notes.

---

### M-02: CORS Allows All Origins

**Location**: `backend\handler\handler.go:45`
**Description**: `Access-Control-Allow-Origin: *` allows any website to make cross-origin API requests. Combined with no authentication, this is low-impact for the demo but should be restricted in production.
**Recommendation for production**: Replace `*` with the specific frontend origin.
**Status**: ACCEPTED FOR DEMO.

---

### M-03: Database Files Included in Docker Image

**Location**: `.dockerignore` (original)
**Description**: The `.dockerignore` was missing `*.db`, `*.db-wal`, `*.db-shm` patterns. The Dockerfile's `COPY backend/ ./` in the build stage would copy any leftover SQLite database files from `backend/`, inflating the image and potentially shipping test data to production.
**Fix**: Added `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm` to `.dockerignore`.
**Status**: FIXED in `.dockerignore`.

---

### M-04: rehype-raw Imported but Unused

**Location**: `frontend\package.json:19`
**Description**: `rehype-raw` (v7.0.0) is listed as a dependency but is never imported or used in any component. `react-markdown` does not pass `rehypePlugins={[rehypeRaw]}`. This is dead code that adds an unnecessary dependency with its own security surface. If accidentally activated, `rehype-raw` would parse raw HTML in Markdown, creating an XSS vector.
**Recommendation**: Remove `rehype-raw` from `package.json` dependencies. Do NOT add it to the `react-markdown` rehype plugin chain unless HTML rendering is explicitly required with proper sanitization (via `rehype-sanitize`).
**Status**: RECOMMENDED FOR CLEANUP.

---

### M-05: Webhook Secrets Stored in Plaintext [FIXED]

**Location**: `backend\store\store.go` (`webhooks.secret`)
**Description**: Incoming webhook secrets were previously persisted in SQLite as plaintext. The WebSocket control-plane contract avoided returning secrets from `webhook_list`, and `store.Webhook.Secret` was tagged `json:"-"`, but a database leak could still expose active webhook credentials.
**Fix**: `webhook_create` now returns a high-entropy secret only once to the creator. `CreateWebhook` stores a versioned salted HMAC hash, `VerifyWebhookSecret` compares submitted secrets in constant time, and store startup migrates legacy plaintext rows to hashes. `webhook_list` remains restricted to group owner/admin role and returns redacted DTOs.
**Remaining production follow-up**: Add webhook secret rotation and audit logging for create/delete events.
**Status**: FIXED.

---

### L-01: Hardcoded WebSocket URL

**Location**: `frontend\src\lib\api.ts:205`
**Description**: The WebSocket URL is hardcoded as `ws://localhost:8080/ws`. In the Docker deployment, the Vite dev proxy is absent, so production would require a relative or configurable URL. Currently this works because the Go binary serves both the SPA and the WebSocket endpoint on the same port in the container, but it is brittle.
**Recommendation for production**: Use a relative WebSocket URL (e.g., `const url = \`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws\``) or make it configurable via an environment variable exposed at build time (Vite's `import.meta.env`).
**Status**: ACCEPTED FOR DEMO.

---

### L-02: Username Stored in localStorage

**Location**: `frontend\src\components\JoinScreen.tsx:16-21`
**Description**: The last-used username is persisted in `localStorage` under key `tokendance:username`. This is properly namespaced and the data is non-sensitive (just a username), so the impact is minimal. However, localStorage is accessible to any JavaScript running on the same origin.
**Recommendation**: Acceptable for a demo. For production with auth, use HttpOnly cookies for session tokens instead.
**Status**: ACCEPTED FOR DEMO.

---

### L-03: Verbose Error Logging

**Location**: `backend\hub\client.go:67-68`, `backend\hub\client.go:74`, `backend\store\store.go:119`
**Description**: WebSocket read errors, JSON parse errors, and SQLite query errors are logged with `%v`. While these go to stdout (not clients), they can expose internal paths, query structures, and connection details in logs.
**Recommendation**: Consider reducing log verbosity in production or using structured logging with configurable levels.
**Status**: ACCEPTED FOR DEMO.

---

### L-04: No Database Connection Pool Limit

**Location**: `backend\store\store.go:25`
**Description**: `sql.Open("sqlite", dbPath)` uses default driver settings which set `MaxOpenConns` to 0 (unlimited). Since the pure-Go SQLite driver serializes writes, this is less of a concern than with client-server databases, but it is good practice to set explicit limits.
**Recommendation**: Add `s.db.SetMaxOpenConns(1)` for SQLite (single writer) or a small value. Add `s.db.SetMaxIdleConns(1)` and `s.db.SetConnMaxLifetime(5 * time.Minute)`.
**Status**: ACCEPTED FOR DEMO.

---

### L-05: No Docker HEALTHCHECK [FIXED]

**Location**: `Dockerfile`, `Dockerfile.runtime`
**Description**: No `HEALTHCHECK` instruction is defined. Docker cannot automatically detect if the application is healthy or restart it on failure.
**Fix**: Added `HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3` to both runtime images. The command extracts the active port from `CHAT_ADDR` and probes `http://127.0.0.1:<port>/api/health`, so it works with default `:8080` and non-default deployment listeners.
**Status**: FIXED.

---

## 3. Items Verified as Secure

The following areas were reviewed and found to be correctly implemented:

| Area | Verification |
|------|-------------|
| **SQL Injection** | All queries use parameterized placeholders (`?`). No string concatenation in SQL. `store.go:75-78`, `store.go:106-113`. |
| **SQLite WAL Mode** | `PRAGMA journal_mode=WAL` is safe, improves concurrency, no security risk. WAL/SHM files excluded from version control and Docker builds. |
| **Username Validation** | `hub.go:202` -- regex `^[\p{Han}a-zA-Z0-9_]{1,20}$`. No HTML or special chars allowed. Frontend `JoinScreen.tsx:43` has a matching check. |
| **Message Size Limit** | `client.go:24` -- `maxMessageSize = 4096` bytes set via `SetReadLimit`. Prevents memory bombs from oversized frames. |
| **Rate Limiting** | `client.go:205-229` -- sliding window of 5 messages/second per connection. Timestamps cleaned on each check, bounded memory. |
| **Ping/Pong Keep-Alive** | `client.go:58-61`, `client.go:238-242` -- 54s ping interval, 60s pong timeout. Orphaned connections are cleaned up. |
| **react-markdown Safety** | `MessageBubble.tsx:131` -- no `rehype-raw` plugin used. Markdown renders as React elements, not raw HTML. XSS-safe. |
| **Graceful Shutdown** | `main.go:94-106` -- SIGINT/SIGTERM handler with 10s timeout for `server.Shutdown()`. |
| **HTTP Timeouts** | `main.go:54-57` -- ReadTimeout (15s), WriteTimeout (15s), IdleTimeout (60s). Prevents slowloris-style attacks. |
| **Send Buffer Backpressure** | `hub.go:108-113`, `hub.go:123-129` -- full client send buffers cause message drops (system/user_left) or connection termination (broadcast). Prevents memory unbounded growth. |
| **WS Error Messages** | Error messages sent to clients are generic descriptions (e.g., "rate limit exceeded"), not stack traces or internal state. |
| **Webhook List Redaction** | `webhook_list` is owner/admin-only and returns redacted webhook DTOs without `secret`; frontend normal list state also excludes secrets. |
| **Media Key Containment** | Local/WebDAV/S3 media stores reject empty segments, `.` and `..`; custom emoji no longer bypasses the media abstraction. |
| **.env Gitignored** | `.gitignore:17-18` covers `.env` and `.env.local`. No secrets committed. |
| **Minimal Docker Image** | `alpine:3.21` base with only `ca-certificates` and `tzdata`. Build uses multi-stage to exclude Go toolchain from runtime. |
| **Docker Healthcheck** | `Dockerfile` and `Dockerfile.runtime` probe same-container `/api/health` and follow `CHAT_ADDR`, covering both default and non-default listeners. |

---

## 4. Overall Security Posture

**Assessment**: The application is well-architected for a demo with solid fundamentals: parameterized queries, message size limits, per-connection rate limiting, WebSocket ping/pong keep-alive, minimal Docker image, and proper git hygiene. The core WebSocket protocol handling and database layer are secure.

**Risk profile for demo**: LOW. The remaining MEDIUM issues (open CORS, open WebSocket origin) are intentional design choices for a public demo with no authentication. They would only become exploitable in contexts beyond the demo's scope (e.g., if sensitive data were added or authentication were introduced without corresponding origin restrictions).

**Risk profile for production**: HIGH. Before deploying to production with real users:

1. **Restrict WebSocket origins** (`handler\ws.go:16-18`) -- validate `Origin` header
2. **Restrict CORS** (`handler\handler.go:45`) -- use specific origin, not `*`
3. **Make WebSocket URL configurable** (`frontend\src\lib\api.ts:205`) -- use relative/protocol-relative URL
4. **Add rate limiting at HTTP/nginx layer** -- per-IP connection rate limiting
5. **Set up proper logging** -- structured logging with rotation, avoid verbose error leak
6. **Remove `rehype-raw`** from frontend dependencies
7. **Add nginx security headers** as defense-in-depth (`nginx\tokendance.conf`)
8. **Add authentication** if user identity matters (JWT, session cookies with HttpOnly/SameSite)
9. **Set explicit DB connection pool limits** (`store.go:25`)
10. **Add webhook rotation/audit logs** -- support secret rotation and record create/delete events
11. **Keep object storage private** -- S3-compatible endpoint, bucket, access key, and secret key belong in deploy env, not public docs or frontend state

---

## 5. Acceptable-for-Demo vs Production-Required

| Category | Acceptable for Demo | Must Fix for Production |
|----------|---------------------|------------------------|
| WS origin check = allow all | Yes | No -- restrict to known domains |
| CORS = wildcard | Yes | No -- restrict to specific origin |
| No auth | Yes | Yes -- add authentication |
| Missing security headers | No (FIXED) | FIXED |
| Path traversal risk | No (FIXED) | FIXED |
| No connection limit | No (FIXED) | FIXED |
| No backend content validation | No (FIXED) | FIXED |
| Docker runs as root | No (FIXED) | FIXED |
| DB files in Docker image | No (FIXED) | FIXED |
| Hardcoded WS URL | Yes | No -- make configurable |
| rehype-raw in deps | Yes | No -- remove unused dependency |
| No Docker HEALTHCHECK | No (FIXED) | FIXED |
| No DB pool limits | Yes | Recommended |
| nginx missing security headers | Yes | Recommended |
| Webhook secrets stored plaintext | No (FIXED) | FIXED; rotation and audit logging still recommended |
