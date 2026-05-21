#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARY_NAME="tokendancechat"
OUTPUT_BIN="$PROJECT_DIR/backend/$BINARY_NAME"

echo "=== Building TokenDanceChat ==="

# ------------------------------------------------
# Step 1: Build frontend
# ------------------------------------------------
echo ""
echo "[1/2] Building frontend..."
cd "$PROJECT_DIR/frontend"

if [ ! -f "package.json" ]; then
    echo "Error: frontend/package.json not found"
    exit 1
fi

npm ci
npm run build

echo "Frontend build complete."

# ------------------------------------------------
# Step 2: Build backend (cross-compile for Linux amd64)
# ------------------------------------------------
echo ""
echo "[2/2] Building backend (linux/amd64)..."
cd "$PROJECT_DIR/backend"

if [ ! -f "go.mod" ]; then
    echo "Error: backend/go.mod not found"
    exit 1
fi

GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o "$BINARY_NAME" .

echo "Backend build complete."

# ------------------------------------------------
# Done
# ------------------------------------------------
echo ""
echo "=== Build successful ==="
echo "Binary:  $OUTPUT_BIN"
echo "Frontend: $PROJECT_DIR/frontend/dist"
ls -lh "$OUTPUT_BIN"
