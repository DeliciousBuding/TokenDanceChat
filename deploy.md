# Deployment Guide for TokenDanceChat

Public deployment target: [chat.vectorcontrol.tech](https://chat.vectorcontrol.tech)

## Prerequisites

- Linux server with systemd
- Nginx installed
- Domain DNS pointing to the server
- Build machine with Go 1.24+ and Node.js 22+

## 1. Build

From the project root:

```bash
bash scripts/build.sh
```

This cross-compiles the Go binary for `linux/amd64` and bundles the frontend into `frontend/dist/`.

## 2. Deploy

Copy the binary and frontend to the target server:

```bash
bash scripts/deploy.sh <user@server-host>
```

Example:

```bash
bash scripts/deploy.sh deploy@my-server
```

## 3. Verify

```bash
curl http://localhost:8080/api/health
# → {"status":"ok"}
```

## 4. Nginx

```bash
sudo cp nginx/tokendance.conf /etc/nginx/sites-available/tokendance
sudo ln -s /etc/nginx/sites-available/tokendance /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 5. TLS (Certbot)

```bash
sudo certbot --nginx -d chat.vectorcontrol.tech
```

Certbot will automatically configure HTTPS and auto-renewal. If TLS is handled by an external proxy (e.g., Cloudflare), skip this step.

## 6. View Logs

```bash
journalctl -u tokendancechat -f
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CHAT_ADDR` | `:8080` | Listen address and port |
| `CHAT_DB_PATH` | `data/chat.db` | SQLite database file path |
| `CHAT_FRONTEND_DIR` | `frontend/dist` | Directory containing built SPA assets |
| `MAX_MSG_PER_SEC` | `5` | Rate limit per WebSocket connection |

Copy `.env.example` to `.env` and adjust as needed.

## Updates

```bash
git pull
bash scripts/build.sh
bash scripts/deploy.sh <user@server-host>
```
