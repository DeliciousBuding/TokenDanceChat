#!/bin/bash
set -euo pipefail

# --------------------------------------------------
# deploy.sh -- Deploy TokenDanceChat to target server
# --------------------------------------------------
# Usage: bash scripts/deploy.sh <user@server-host>
# Example: bash scripts/deploy.sh deploy@my-server
# --------------------------------------------------

if [ $# -lt 1 ]; then
    echo "Usage: $0 <user@server-host>"
    echo "Example: $0 deploy@my-server"
    exit 1
fi

SERVER_HOST="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Customize these paths for your server
REMOTE_BIN_DIR="/opt/tokendancechat"
REMOTE_FRONTEND_DIR="/opt/tokendancechat/frontend/dist"
REMOTE_SERVICE="tokendancechat"

BINARY="$PROJECT_DIR/backend/tokendancechat"
FRONTEND_DIST="$PROJECT_DIR/frontend/dist"

# Verify artifacts exist
if [ ! -f "$BINARY" ]; then
    echo "Error: Binary not found at $BINARY"
    echo "Run 'bash scripts/build.sh' first."
    exit 1
fi

if [ ! -d "$FRONTEND_DIST" ]; then
    echo "Error: Frontend dist not found at $FRONTEND_DIST"
    echo "Run 'bash scripts/build.sh' first."
    exit 1
fi

echo "=== Deploying TokenDanceChat to $SERVER_HOST ==="

# --------------------------------------------------
# Step 1: Stop the service before copying
# --------------------------------------------------
echo ""
echo "[1/4] Stopping remote service..."
ssh "$SERVER_HOST" "systemctl --user stop $REMOTE_SERVICE 2>/dev/null || sudo systemctl stop $REMOTE_SERVICE 2>/dev/null || true"
echo "Service stopped (or was not running)."

# --------------------------------------------------
# Step 2: Copy binary
# --------------------------------------------------
echo ""
echo "[2/4] Copying binary to $SERVER_HOST:$REMOTE_BIN_DIR ..."
ssh "$SERVER_HOST" "mkdir -p $REMOTE_BIN_DIR"
scp "$BINARY" "$SERVER_HOST:$REMOTE_BIN_DIR/tokendancechat"
ssh "$SERVER_HOST" "chmod +x $REMOTE_BIN_DIR/tokendancechat"
echo "Binary copied."

# --------------------------------------------------
# Step 3: Copy frontend
# --------------------------------------------------
echo ""
echo "[3/4] Copying frontend to $SERVER_HOST:$REMOTE_FRONTEND_DIR ..."
ssh "$SERVER_HOST" "mkdir -p $REMOTE_FRONTEND_DIR"
rsync -avz --delete "$FRONTEND_DIST/" "$SERVER_HOST:$REMOTE_FRONTEND_DIR/"
echo "Frontend copied."

# --------------------------------------------------
# Step 4: Restart service
# --------------------------------------------------
echo ""
echo "[4/4] Restarting service..."
if ssh "$SERVER_HOST" "systemctl --user restart $REMOTE_SERVICE" 2>/dev/null; then
    echo "Service restarted via systemctl --user."
elif ssh "$SERVER_HOST" "sudo systemctl restart $REMOTE_SERVICE" 2>/dev/null; then
    echo "Service restarted via sudo systemctl."
else
    echo "Warning: Could not restart $REMOTE_SERVICE. You may need to restart it manually:"
    echo "  systemctl --user restart $REMOTE_SERVICE"
    echo "  -- or --"
    echo "  sudo systemctl restart $REMOTE_SERVICE"
fi

# --------------------------------------------------
# Quick health check
# --------------------------------------------------
echo ""
echo "Waiting 3 seconds for service to start..."
sleep 3
echo "Health check:"
ssh "$SERVER_HOST" "curl -s http://localhost:8080/api/health || echo 'Health check failed'"

echo ""
echo "=== Deploy complete ==="
echo "View logs:  journalctl -u $REMOTE_SERVICE -f"
echo "Service URL: https://chat.vectorcontrol.tech"
