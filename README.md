# TokenDanceChat

A lightweight real-time public chat application built to validate the AgentHub tech stack.

**Stack**: Go + WebSocket + SQLite | React 19 + Vite + Tailwind CSS 4 | Docker

**Deployed at**: [chat.vectorcontrol.tech](https://chat.vectorcontrol.tech)

## Quick Start

```bash
# Backend
cd backend && go run .

# Frontend (dev)
cd frontend && npm install && npm run dev

# Docker
docker compose up -d
```

## Architecture

```
Browser --WSS--> Go Hub Server (:8080) --> SQLite
                   |
                   +--> WebSocket broadcast to all clients
```

- **Backend**: Go 1.24, gorilla/websocket, modernc.org/sqlite (pure Go, no CGO)
- **Frontend**: React 19, Vite, Tailwind CSS 4, zustand, react-markdown
- **Deploy**: Multi-stage Docker build, nginx reverse proxy

## Features

- Public chat room — enter a username and start chatting
- Real-time messaging via WebSocket
- Message history persisted in SQLite
- Online user list with live updates
- Markdown rendering in messages
- Auto-reconnect on connection loss
- Rate limiting (5 msg/sec per connection)
- Responsive design (mobile-friendly sidebar)
