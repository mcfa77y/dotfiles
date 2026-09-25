#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
export NODE_PATH="${NODE_PATH:-}:$REPO_ROOT/node_modules:$REPO_ROOT/workspaces/backend-api/node_modules:$REPO_ROOT/workspaces/mock-services/node_modules"

node "$SCRIPT_DIR/verify_sqs_md5.cjs" "$@"
