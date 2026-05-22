# ---- Stage 1: Build frontend ----
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Build backend ----
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/go.mod backend/go.sum* ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server .

# ---- Stage 3: Runtime ----
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --from=backend-builder /app/server /app/server

# Create data directory with correct ownership.
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data /app/frontend

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD sh -ec 'port="${CHAT_ADDR:-:8080}"; port="${port##*:}"; wget -qO- "http://127.0.0.1:${port}/api/health" >/dev/null'

CMD ["/app/server"]
