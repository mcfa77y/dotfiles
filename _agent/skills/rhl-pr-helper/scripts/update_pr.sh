#!/usr/bin/env bash
set -euo pipefail

# update_pr.sh: Validate a formatted PR message file, then update the PR via gh CLI and re-verify.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/update_pr.js" "$@"
