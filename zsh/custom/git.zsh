# Git functions

export EMPO_WORKTREE_DIR="$PROJECTS_DIR/empo_health/empo-worktrees"
export WORKTREE_DIR=$EMPO_WORKTREE_DIR
export NEATLEAF_DIR="$PROJECTS_DIR/neatleaf"

export GIT_TOOL_DIR="$PY_DIR/git_tools/git_tools"
export GIT_TOOL_JS_DIR="$JS_DIR/git-tools-js"
alias gfetch='git fetch --prune'
alias gFzfBranches='git branch -a | fzf | xargs -I {} echo {} | sed "s/remotes\/origin\///" | sed "s/^[\+\*] //"'
alias gpnv='git push --no-verify'
alias gpfnv='git push --force --no-verify'

alias gtimestamp='echo "[$(date "+%b-%d %H:%M")] $(git_current_branch)"'
alias gstash='git stash push -m '
alias gstashd='git stash push -m "delete me: $(gtimestamp)"'
alias gstashp='git stash pop'
alias gback='git checkout -'
alias gmain='gstash "switching to main: $(gtimestamp)"; gcm; gl'
alias gpull='gstashd; git pull; gstashp'

# Prune stale branches
alias gprune='uv run $GIT_TOOL_DIR/git_stale_branches.py --directory $PWD'

# Worktrees
# - prune
alias wprune='uv run $GIT_TOOL_DIR/git_worktree_prune.py --directory $PWD'

# - list
alias wls='uv run $GIT_TOOL_DIR/git_worktree_list.py --directory $PWD'

# - use worktrunk with config
alias wtc='wt --config "$GIT_TOOL_JS_DIR/.config/wt.toml"'
# - add working tree from existing remote branch
# alias wta='uv run $GIT_TOOL_DIR/git_worktree_and_branches.py --here_directory $PWD'
alias wtexisting='HERE=$(pwd); cd $RHL_DIR; wt switch --config "$GIT_TOOL_JS_DIR/.config/wt.toml" --remotes $(clippaste); cd $HERE'

# - add worktree from clipboard
# alias wtaa='HERE=$(pwd); cd $GIT_TOOL_JS_DIR; bun run cli create $(clippaste)'
alias wtnew='HERE=$(pwd); cd $RHL_DIR; wt switch --config "$GIT_TOOL_JS_DIR/.config/wt.toml" --create $(clippaste); cd $HERE'

# - git push no verify
alias gpnv='git push --no-verify'

# Gitkraken launch 2024-02-29 happy leap year!
unalias gg 2>/dev/null
gg() { command gk graph --gitkraken "$@"; }

alias zgittools_py='cd $GIT_TOOL_DIR'
alias zgittools='cd $GIT_TOOL_JS_DIR'
alias egtools='zgittools; ee .'
alias ngtools='zgittools; nv .'

function gCommitAndPush() {
  git commit s-am "$*" --no-verify && git push --no-verify
}

# 2025-02-26
alias lg='lazygit'

wtjs() {
  (cd "$GIT_TOOL_JS_DIR" && bun start)
}

wtjs-cli() {
  (cd "$GIT_TOOL_JS_DIR" && bun run cli)
}

# 2026-02-13
# change directory to a worktree
alias wts='zrhl; wt switch; cdev'

# 2026-08-19 worktrees list
alias wtl='wt list'

# 2026-04-08
# function to create a backup git branch
function git_bak() {
  # 1. Get the current branch name
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

  # 2. Define the backup name
  BACKUP_BRANCH="${CURRENT_BRANCH}-BAK"

  echo "Creating backup branch: $BACKUP_BRANCH..."

  # 3. Create the backup branch at the current HEAD
  # We use 'git branch' instead of 'checkout -b' so we don't move
  git branch "$BACKUP_BRANCH"

  if [ $? -eq 0 ]; then
    echo "Success! Backup created. You are still on '$CURRENT_BRANCH'."
  else
    echo "Error: Could not create backup. Does '$BACKUP_BRANCH'."
  fi
}

# 2026-07-31 sparse-checkout
alias git-fix-unable-to-rmdir='git sparse-checkout set .github/.yarn workspaces/backend-api workspaces/frontend-app workspaces/helper-scripts workspaces/qa workspaces/workspaces/helper-scripts'

# 2026-08-27
function sync-stack() {
  local base stashed=0
  if [ -z "$1" ]; then
    command -v fzf >/dev/null || {
      echo "fzf is required for interactive mode"
      return 1
    }
    base=$(git for-each-ref --format='%(if)%(symref)%(then)%(else)%(refname:lstrip=3)%(end)' refs/remotes/origin | sed '/^$/d' | fzf --prompt='Base branch: ') || return 1
    [ -n "$base" ] || return 1
  else
    base="${1#origin/}"
  fi
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "Stashing uncommitted changes..."
    git stash push -m "sync-stack auto-stash" || return 1
    stashed=1
  fi
  if git fetch origin "$base" && git rebase "origin/$base" && git push --force-with-lease; then
    if [ "$stashed" -eq 1 ]; then
      echo "Popping stashed changes..."
      git stash pop
    fi
  else
    if [ "$stashed" -eq 1 ]; then
      echo "Rebase/push failed. Your uncommitted changes are preserved in stash:"
      git stash list -1
    fi
    return 1
  fi
}

function sync-4119() {
  sync-stack rhl-4119-scaffold-workspacesmock-services-nestjs-package-docker-setup
}

# 2026-04-02 Git rebase with stash pop
alias ggrbom='sync-stack main'
