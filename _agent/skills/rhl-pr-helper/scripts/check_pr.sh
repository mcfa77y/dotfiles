#!/usr/bin/env bash
set -euo pipefail

# check_pr.sh: Fetch a GitHub Pull Request by number and validate its title and body
# against Empo Health PR format rules.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/check_pr.js" "$@"
