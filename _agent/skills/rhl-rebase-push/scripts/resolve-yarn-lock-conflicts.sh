#!/usr/bin/env bash
# ==============================================================================
# resolve-yarn-lock-conflicts.sh
#
# Automates the resolution of yarn.lock merge/rebase conflicts across root and
# sub-workspace Yarn projects in a monorepo.
#
# Key Features:
# 1. Detects all unmerged yarn.lock files (root and sub-workspaces).
# 2. Handles git's "You must edit all merge conflicts" pitfall caused by unrelated
#    unstaged working directory modifications by safely shelving WIP edits.
# 3. Leverages Yarn Berry's native conflict-marker resolution via `yarn install`.
# 4. Verifies resolution via `yarn install --immutable`.
# 5. Stages resolved lockfiles and optionally advances `git rebase --continue`.
# 6. Restores any shelved working directory modifications.
# ==============================================================================

set -euo pipefail

AUTO_CONTINUE=false
STASH_WIP=true
DRY_RUN=false
TARGET_DIR=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] [WORKSPACE_DIR]

Options:
  --continue         Automatically run 'git rebase --continue' after resolving and staging
  --no-stash-wip     Do not automatically stash/restore unrelated unstaged modifications
  --dry-run          Show actions without running yarn install or git operations
  -h, --help         Show this help message

Arguments:
  WORKSPACE_DIR      Optional path to git workspace root (defaults to current directory)
EOF
  exit 0
}

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    --continue)
      AUTO_CONTINUE=true
      shift
      ;;
    --no-stash-wip)
      STASH_WIP=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      if [[ -z "$TARGET_DIR" ]]; then
        TARGET_DIR="$1"
        shift
      else
        echo "Error: Unknown argument: $1" >&2
        usage
      fi
      ;;
  esac
done

if [[ -n "$TARGET_DIR" ]]; then
  cd "$TARGET_DIR"
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "$REPO_ROOT" ]]; then
  echo "Error: Not inside a git repository." >&2
  exit 1
fi
cd "$REPO_ROOT"

echo "==> Scanning for conflicted yarn.lock files in $REPO_ROOT..."

# Identify conflicted yarn.lock files
mapfile -t CONFLICTED_LOCKS < <(git diff --name-only --diff-filter=U 2>/dev/null | grep -E "(^|/)yarn\.lock$" || true)

if [[ ${#CONFLICTED_LOCKS[@]} -eq 0 ]]; then
  echo "No conflicted yarn.lock files detected."
  if [[ -d "$(git rev-parse --git-path rebase-merge)" || -d "$(git rev-parse --git-path rebase-apply)" ]]; then
    echo "Note: Rebase is currently in progress."
  fi
  exit 0
fi

echo "Found ${#CONFLICTED_LOCKS[@]} conflicted lockfile(s):"
for lock in "${CONFLICTED_LOCKS[@]}"; do
  echo "  - $lock"
done

WIP_PATCH=""
trap_cleanup() {
  if [[ -n "$WIP_PATCH" && -f "$WIP_PATCH" ]]; then
    rm -f "$WIP_PATCH"
  fi
}
trap trap_cleanup EXIT

# Check for unrelated unstaged changes that trigger Git rebase failure
UNSTAGED_NON_LOCKS=$(git diff --name-only | grep -v -E "(^|/)yarn\.lock$" || true)

if [[ -n "$UNSTAGED_NON_LOCKS" && "$STASH_WIP" == "true" ]]; then
  echo "==> Shelving unrelated unstaged modifications to prevent Git rebase aborts..."
  WIP_PATCH=$(mktemp -t wip_rebase_unstaged.XXXXXX.patch)
  git diff -- $(echo "$UNSTAGED_NON_LOCKS") > "$WIP_PATCH"
  git restore -- $(echo "$UNSTAGED_NON_LOCKS")
  echo "    Saved $(wc -l < "$WIP_PATCH" | tr -d ' ') lines of unstaged diff to $WIP_PATCH."
fi

# Process each conflicted lockfile
for lock in "${CONFLICTED_LOCKS[@]}"; do
  LOCK_DIR=$(dirname "$lock")
  echo "==> Resolving conflicts in $lock..."
  
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] (cd $LOCK_DIR && yarn install)"
    echo "[dry-run] git add $lock"
    continue
  fi

  (
    cd "$LOCK_DIR"
    echo "    Running 'yarn install' in $LOCK_DIR..."
    yarn install
    echo "    Running 'yarn install --immutable' to verify lockfile consistency..."
    yarn install --immutable
  )

  echo "    Staging resolved lockfile: $lock"
  git add "$lock"
done

# Restore shelved unstaged modifications if any
if [[ -n "$WIP_PATCH" && -f "$WIP_PATCH" && -s "$WIP_PATCH" ]]; then
  echo "==> Restoring shelved unstaged modifications..."
  if ! git apply --3way "$WIP_PATCH" 2>/dev/null; then
    echo "    Notice: 3-way apply failed, attempting direct apply..."
    git apply "$WIP_PATCH" 2>/dev/null || {
      echo "    Warning: Could not automatically re-apply patch cleanly." >&2
      echo "    The patch has been preserved at: $WIP_PATCH" >&2
      WIP_PATCH="" # Prevent trap cleanup so user can recover
    }
  fi
  if [[ -n "$WIP_PATCH" ]]; then
    echo "    Successfully restored unstaged changes."
  fi
fi

echo "==> All yarn.lock conflicts successfully resolved and staged!"

if [[ "$AUTO_CONTINUE" == "true" ]]; then
  if [[ -d "$(git rev-parse --git-path rebase-merge)" || -d "$(git rev-parse --git-path rebase-apply)" ]]; then
    echo "==> Continuing git rebase..."
    GIT_EDITOR=true git rebase --continue
  else
    echo "Notice: No active rebase in progress to continue."
  fi
else
  echo "Next steps:"
  echo "  - Verify status: git status"
  echo "  - Continue rebase: git rebase --continue"
fi
