# TokenDance ID OIDC Integration Guide

TokenDanceChat supports login via [TokenDance ID](https://id.vectorcontrol.tech), a real OIDC provider that supports Authorization Code + PKCE flow.

## Prerequisites

- Access to https://id.vectorcontrol.tech
- Administrator access to the TokenDance ID dashboard

## Step 1: Register an OAuth App

1. Log in to https://id.vectorcontrol.tech
2. Navigate to **Dashboard** -> **Apps**
3. Click **New App**
4. Fill in the application details:
   - **Name**: `TokenDanceChat`
   - **Redirect URI**: `http://localhost:8080/api/oidc/callback` (for local dev)
5. After creation, note your credentials:
   - **client_id**: format `c_xxxxxxxxxxxxxxxx`
   - **client_secret**: format `cs_xxxxxxxxxxxxxxxx`, shown once. The current TokenDanceChat backend does not read a client secret, so register/use a PKCE public-client style app unless you also add a `CHAT_OIDC_CLIENT_SECRET` code path.

## Step 2: Configure Environment Variables

Copy `.env.example` to `.env` (or `.env.local`) and set:

```bash
CHAT_OIDC_ENABLED=true
CHAT_OIDC_ISSUER=https://id.vectorcontrol.tech
CHAT_OIDC_CLIENT_ID=c_YOUR_CLIENT_ID_HERE
CHAT_OIDC_REDIRECT_URI=http://localhost:8080/api/oidc/callback
CHAT_SESSION_SECRET=replace_with_a_stable_random_secret
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
oidc: discovered provider at https://id.vectorcontrol.tech
oidc: enabled — issuer=https://id.vectorcontrol.tech client_id=c_xxx
```

If OIDC discovery fails, check that:
- The issuer URL is reachable
- The `.well-known/openid-configuration` endpoint responds with 200

## Step 4: Test the OIDC Flow

1. Open http://localhost:8080 in a browser
2. Click the **"Login with TokenDance ID"** button
3. You will be redirected to https://id.vectorcontrol.tech/oidc/authorize
4. Log in with your TokenDance ID credentials (email/password, GitHub, Google, or Feishu)
5. After authorization, you are redirected back to the chat app
6. The URL will contain `?oidc_success=1&oidc_username=<your_username>&oidc_rid=<redeem_id>`
7. The frontend exchanges the redeem ID for tokens via `POST /api/oidc/redeem`

## Relying-Party Checklist

| Boundary | Current TokenDanceChat behavior |
|----------|---------------------------------|
| Callback | Local `http://localhost:8080/api/oidc/callback`; production `https://chat.vectorcontrol.tech/api/oidc/callback` |
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

Based on the discovery document at https://id.vectorcontrol.tech/.well-known/openid-configuration:

| Endpoint | URL |
|----------|-----|
| Authorization | `https://id.vectorcontrol.tech/oidc/authorize` |
| Token | `https://id.vectorcontrol.tech/oidc/token` |
| UserInfo | `https://id.vectorcontrol.tech/oidc/userinfo` |
| JWKS | `https://id.vectorcontrol.tech/oidc/jwks` |

## Supported Features

- **Authorization Code + PKCE** (S256 challenge method)
- **ID Token signing**: RS256
- **Scopes**: `openid profile email offline_access`
- **Token auth**: `client_secret_basic`, `client_secret_post`
- **Claims**: `iss`, `sub`, `aud`, `exp`, `iat`, `email`, `email_verified`, `name`, `picture`

## Current Gaps / TODO

1. **Client Secret**: The current backend does not send `client_secret` at the token endpoint. Keep the OAuth app compatible with PKCE public-client exchange, or add `CHAT_OIDC_CLIENT_SECRET` and token-endpoint authentication before switching to a confidential client.

2. **UserInfo Endpoint**: The backend intentionally relies on validated ID token claims and does not call UserInfo. Add UserInfo only if the chat app needs profile fields not present in the ID token.

3. **Refresh Persistence**: The refresh endpoint is implemented, but the current UI keeps refresh tokens only in memory. A reload falls back to local username reconnect instead of a durable OIDC session.

4. **Provider Logout**: Chat logout/disconnect is local-only. Add a TokenDance ID `/logout` redirect if global logout semantics are required.

## Production Deployment

For production deployment to `https://chat.vectorcontrol.tech`:

1. Register a separate OAuth App in the TokenDance ID dashboard with the production redirect URI:
   ```
   https://chat.vectorcontrol.tech/api/oidc/callback
   ```

2. Set production environment variables:
   ```bash
   CHAT_OIDC_ENABLED=true
   CHAT_OIDC_ISSUER=https://id.vectorcontrol.tech
   CHAT_OIDC_CLIENT_ID=c_YOUR_PRODUCTION_CLIENT_ID
   CHAT_OIDC_REDIRECT_URI=https://chat.vectorcontrol.tech/api/oidc/callback
   ```

3. Ensure HTTPS is properly configured for the production deployment.

4. Set `CHAT_ALLOWED_ORIGINS=.vectorcontrol.tech` to allow CORS from subdomains.

5. Consider setting a `CHAT_OIDC_CLIENT_SECRET` environment variable and updating the backend to include it in token requests if required by the provider.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "OIDC setup failed: oidc discovery failed" | Provider unreachable or wrong issuer URL | Verify `CHAT_OIDC_ISSUER` and network connectivity |
| "oidc_error=invalid_state" on callback | PKCE state expired or tampered | State entries expire after 10 minutes; start fresh login |
| "oidc_error=token_exchange_failed" | Token endpoint rejected the request | Check client_id, client_secret, and redirect_uri match the OAuth App |
| "oidc_error=invalid_token" | ID token validation failed | Check JWKS reachability, issuer/audience mismatch, or clock skew |
| Frontend shows no "Login with TokenDance ID" button | OIDC not enabled | Set `CHAT_OIDC_ENABLED=true` |
