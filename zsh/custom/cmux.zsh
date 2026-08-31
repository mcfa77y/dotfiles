# Runner for cmux-ts CLI tools
function _cmux_ts() {
  local cmux_ts_dir="${OMZ_CUSTOM_DIR:-$HOME/dotfiles/zsh/custom}/scripts/cmux-ts"
  local cmux_ts_bin="$cmux_ts_dir/bin/cmux-ts"

  if [[ -x "$cmux_ts_bin" ]]; then
    "$cmux_ts_bin" "$@"
  else
    bun run --cwd "$cmux_ts_dir" src/index.ts "$@"
  fi
}

alias cmux-ts='_cmux_ts'

# Sets workspace name to directory name (defaults to $PWD), trimmed to max 32 characters
# Usage: cmux-set-workspace-name [path]
function cmux-set-workspace-name() {
  _cmux_ts workspace-name "$@"
}

alias cwrn='cmux-set-workspace-name'

# Custom cmux function for Oh My Zsh
# Usage: cmux-tab --name <tab_name> --command <command_to_run> [--focus] [--cwd <path>]
# Example: cmux-tab --name "BE Server" --command "echo 'new foo'"
# By default, creates new surface in background. Use --focus (or -f) to switch focus.
function cmux-tab() {
  _cmux_ts tab "$@"
}

alias ct='cmux-tab'

# Get title of the current cmux surface
function cmux-current-title() {
  _cmux_ts current-title "$@"
}

# Workspace development launcher with omp-empo (left) and nvim (right)
# Usage: cmux-dev [path] [--no-focus] [--omp <command>] [--nvim <command>]
# Example: cmux-dev
# Example: cdev ~/Projects/myrepo
function cmux-dev() {
  _cmux_ts dev "$@"
}

alias cdev='cmux-dev'
