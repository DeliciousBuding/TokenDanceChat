# Deployment Guide for TokenDanceChat (chat.vectorcontrol.tech)

## Prerequisites

- Docker and Docker Compose installed on the target server (hk2)
- Nginx installed
- Domain `chat.vectorcontrol.tech` DNS pointing to the server

## Build

From the project root:

```bash
docker compose build
```

## Run

Start the container in detached mode:

```bash
docker compose up -d
```

The application will listen on port 8080 inside the container, mapped to host port 8080.
SQLite database will be persisted in `./data/` on the host.

To view logs:

```bash
docker compose logs -f
```

To stop:

```bash
docker compose down
```

## Nginx Setup (hk2 server)

1. Copy the nginx configuration to the server:

```bash
sudo cp nginx/tokendance.conf /etc/nginx/sites-available/tokendance
```

2. Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/tokendance /etc/nginx/sites-enabled/
```

3. Test the configuration:

```bash
sudo nginx -t
```

4. Reload nginx:

```bash
sudo systemctl reload nginx
```

## TLS Certificate (Certbot)

Once HTTP is confirmed working, obtain a Let's Encrypt certificate:

```bash
sudo certbot --nginx -d chat.vectorcontrol.tech
```

Certbot will automatically modify the nginx configuration to enable HTTPS and set up auto-renewal. Alternatively, if your TLS is handled by an external reverse proxy (e.g., Cloudflare or a fronting load balancer), you can keep the nginx config as HTTP-only and terminate TLS at that layer.

## Environment Variables

Copy `.env.example` to `.env` and adjust values before building if needed:

```bash
cp .env.example .env
```

Available variables:

- `PORT` — server listen port (default: 8080)
- `DB_PATH` — SQLite database file path (default: ./data/chat.db)
- `MAX_MSG_PER_SEC` — rate limit per connection (default: 5)

## Updates

```bash
git pull
docker compose build
docker compose up -d --force-recreate
```
