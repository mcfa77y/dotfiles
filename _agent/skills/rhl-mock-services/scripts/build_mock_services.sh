#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")}"
MOCK_DIR="$REPO_ROOT/workspaces/mock-services"

if [ ! -d "$MOCK_DIR" ]; then
  echo "Error: mock-services directory not found at $MOCK_DIR" >&2
  exit 1
fi

echo "Building mock-services in $MOCK_DIR..."
cd "$MOCK_DIR"
yarn build
echo "mock-services build complete."
