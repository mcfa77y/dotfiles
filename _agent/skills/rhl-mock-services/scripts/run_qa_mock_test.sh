#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
QA_DIR="$REPO_ROOT/workspaces/qa"

if [ ! -d "$QA_DIR" ]; then
  echo "Error: qa directory not found at $QA_DIR" >&2
  exit 1
fi

cd "$QA_DIR"

if [ "$#" -eq 0 ]; then
  echo "Running QA tests in mock mode..."
  yarn test:mock
else
  echo "Running QA test in mock mode: $*"
  yarn test:mock "$@"
fi
