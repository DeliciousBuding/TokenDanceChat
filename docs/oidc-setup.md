# TokenDance ID OIDC Integration Guide

TokenDanceChat supports login via [TokenDance ID](https://id.tokendancelab.com), a real OIDC provider that supports Authorization Code + PKCE flow.

## Prerequisites

- Access to https://id.tokendancelab.com
- Administrator access to the TokenDance ID dashboard

## Step 1: Register an OAuth App

1. Log in to https://id.tokendancelab.com
2. Navigate to **Dashboard** -> **Apps**
3. Click **New App**
4. Fill in the application details:
   - **Name**: `TokenDanceChat`
   - **Redirect URI**: `http://localhost:8080/api/oidc/callback` (for local dev)
5. After creation, note your credentials:
   - **client_id**: format `c_xxxxxxxxxxxxxxxx`
   - **client_secret**: format `cs_xxxxxxxxxxxxxxxx`, shown once. Set `CHAT_OIDC_CLIENT_SECRET` (below) to use it as a confidential client; leave it unset to register/use a PKCE public-client style app instead.

## Step 2: Configure Environment Variables

Copy `.env.example` to `.env` (or `.env.local`) and set:

```bash
CHAT_OIDC_ENABLED=true
CHAT_OIDC_ISSUER=https://id.tokendancelab.com
CHAT_OIDC_CLIENT_ID=c_YOUR_CLIENT_ID_HERE
CHAT_OIDC_REDIRECT_URI=http://localhost:8080/api/oidc/callback
CHAT_SESSION_SECRET=replace_with_a_stable_random_secret
# Optional: set for a confidential client; omit for PKCE public client
CHAT_OIDC_CLIENT_SECRET=cs_YOUR_CLIENT_SECRET_HERE
```

**Important**: Never commit `.env` or `.env.local` files. They are gitignored. Keep `CHAT_SESSION_SECRET` stable in deployed environments; if it is omitted, the server generates an ephemeral per-process secret and existing app sessions fail after restart.

## Step 3: Start the Server

```bash
cd tokendance-chat
# Build and run
go run ./backend
```

The server will log on startup:
```
oidc: discovered provider at https://id.tokendancelab.com
oidc: enabled — issuer=https://id.tokendancelab.com client_id=c_xxx
```

If OIDC discovery fails, check that:
- The issuer URL is reachable
- The `.well-known/openid-configuration` endpoint responds with 200

## Step 4: Test the OIDC Flow

1. Open http://localhost:8080 in a browser
2. Click the **"Login with TokenDance ID"** button
3. You will be redirected to https://id.tokendancelab.com/oidc/authorize
4. Log in with your TokenDance ID credentials (email/password, GitHub, Google, or Feishu)
5. After authorization, you are redirected back to the chat app
6. The URL will contain `?oidc_success=1&oidc_username=<your_username>&oidc_rid=<redeem_id>`
7. The frontend exchanges the redeem ID for tokens via `POST /api/oidc/redeem`

## Relying-Party Checklist

| Boundary | Current TokenDanceChat behavior |
|----------|---------------------------------|
| Callback | Local `http://localhost:8080/api/oidc/callback`; production `https://chat.tokendancelab.com/api/oidc/callback` |
| Token exchange | Backend `/api/oidc/callback` exchanges code with `client_id`, `redirect_uri`, and `code_verifier`; no `client_secret` is sent |
| Token handoff | Backend keeps provider tokens behind a one-time redeem ID for 5 minutes; the browser receives only `oidc_rid` in the callback URL |
| Browser storage | Redeemed OIDC access/refresh tokens live in Zustand memory; app `session_token` is stored in `tokendance:sessionToken` for REST Bearer auth and local registered-user WS joins |
| Refresh | `/api/oidc/refresh` forwards refresh tokens to TokenDance ID, but the current UI does not persist refresh tokens across page reload |
| Logout | Chat disconnect clears local chat state only; it does not call TokenDance ID `/logout` |
| Validation | Backend validates ID Token via RS256/JWKS with issuer, audience, expiration leeway, and non-empty `sub`; protected REST endpoints require `Authorization: Bearer <session_token>`; WS joins use OIDC access tokens for OIDC users, app session tokens for local registered users, and no token for guests |

## OIDC Flow Details

| Step | Endpoint | Description |
|------|----------|-------------|
| Discovery | `GET /.well-known/openid-configuration` | Fetched once at startup |
| Login | `GET /api/oidc/login` | Initiates PKCE S256 flow |
| Callback | `GET /api/oidc/callback` | Handles authorization code |
| Redeem | `POST /api/oidc/redeem` | Exchanges redeem ID for tokens |
| Exchange | `POST /api/oidc/exchange` | Backend proxy exchange route for SPA experiments; current login button uses callback + redeem |
| Refresh | `POST /api/oidc/refresh` | Refreshes access token |
| Config | `GET /api/oidc/config` | Returns OIDC config to frontend |

## Provider Endpoints

Based on the discovery document at https://id.tokendancelab.com/.well-known/openid-configuration:

| Endpoint | URL |
|----------|-----|
| Authorization | `https://id.tokendancelab.com/oidc/authorize` |
| Token | `https://id.tokendancelab.com/oidc/token` |
| UserInfo | `https://id.tokendancelab.com/oidc/userinfo` |
| JWKS | `https://id.tokendancelab.com/oidc/jwks` |

## Supported Features

- **Authorization Code + PKCE** (S256 challenge method)
- **ID Token signing**: RS256
- **Scopes**: `openid profile email offline_access`
- **Token auth**: `client_secret_basic`, `client_secret_post`
- **Claims**: `iss`, `sub`, `aud`, `exp`, `iat`, `email`, `email_verified`, `name`, `picture`

## Current Gaps / TODO

1. **Client Secret**: ✅ Resolved. The backend now reads `CHAT_OIDC_CLIENT_SECRET`; when set, the token exchange (`/api/oidc/callback`, `/api/oidc/exchange`) and refresh (`/api/oidc/refresh`) include `client_secret` in the form body, enabling confidential-client apps. Leave the variable empty to keep the original PKCE public-client exchange (still sends `code_verifier`). PKCE is always sent regardless, so a confidential client uses both `client_secret` and `code_verifier`.

2. **UserInfo Endpoint**: The backend intentionally relies on validated ID token claims and does not call UserInfo. Add UserInfo only if the chat app needs profile fields not present in the ID token.

3. **Refresh Persistence**: The refresh endpoint is implemented, but the current UI keeps refresh tokens only in memory. A reload falls back to local username reconnect instead of a durable OIDC session.

4. **Provider Logout**: Chat logout/disconnect is local-only. Add a TokenDance ID `/logout` redirect if global logout semantics are required.

## Production Deployment

For production deployment to `https://chat.tokendancelab.com`:

1. Register a separate OAuth App in the TokenDance ID dashboard with the production redirect URI:
   ```
   https://chat.tokendancelab.com/api/oidc/callback
   ```

2. Set production environment variables:
   ```bash
   CHAT_OIDC_ENABLED=true
   CHAT_OIDC_ISSUER=https://id.tokendancelab.com
   CHAT_OIDC_CLIENT_ID=c_YOUR_PRODUCTION_CLIENT_ID
   CHAT_OIDC_REDIRECT_URI=https://chat.tokendancelab.com/api/oidc/callback
   ```

3. Ensure HTTPS is properly configured for the production deployment.

4. Set `CHAT_ALLOWED_ORIGINS=https://chat.tokendancelab.com` for the deployed app origin. If a deployment intentionally serves trusted subdomains, use an explicit scheme wildcard such as `https://*.example.com`; bare domains, `.example.com`, and `*` are not valid cross-origin allowlist entries.

5. For a confidential client, set `CHAT_OIDC_CLIENT_SECRET` to the production client secret; the backend now includes it in token and refresh requests. Leave it unset to run as a PKCE public client.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "OIDC setup failed: oidc discovery failed" | Provider unreachable or wrong issuer URL | Verify `CHAT_OIDC_ISSUER` and network connectivity |
| "oidc_error=invalid_state" on callback | PKCE state expired or tampered | State entries expire after 10 minutes; start fresh login |
| "oidc_error=token_exchange_failed" | Token endpoint rejected the request | Check client_id, client_secret, and redirect_uri match the OAuth App |
| "oidc_error=invalid_token" | ID token validation failed | Check JWKS reachability, issuer/audience mismatch, or clock skew |
| Frontend shows no "Login with TokenDance ID" button | OIDC not enabled | Set `CHAT_OIDC_ENABLED=true` |
