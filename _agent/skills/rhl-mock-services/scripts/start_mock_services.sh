#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
MOCK_DIR="$REPO_ROOT/workspaces/mock-services"
PORT="${MOCK_PORT:-3001}"

if [ ! -d "$MOCK_DIR" ]; then
  echo "Error: mock-services directory not found at $MOCK_DIR" >&2
  exit 1
fi

if lsof -i :"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Port $PORT is already in use by PID: $(lsof -i :"$PORT" -sTCP:LISTEN -t | tr '\n' ' ')"
  exit 0
fi

echo "Starting mock-services on port $PORT from $MOCK_DIR..."
cd "$MOCK_DIR"
PORT="$PORT" yarn start:dev
