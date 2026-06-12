# Cache shell completions to ~/.zsh/completions (keeps shell startup fast)
cache_completion() {
  local cmd="$1"
  local completion_file="${2:-_$1}"
  local completion_generator="${3:-$cmd completion}"

  if command -v "$cmd" &>/dev/null; then
    local target_dir="$HOME/.zsh/completions"
    local target_file="$target_dir/$completion_file"
    if [[ ! -f "$target_file" ]]; then
      mkdir -p "$target_dir"
      eval "$completion_generator" > "$target_file" 2>/dev/null
    fi
  fi
}

# 2024-01-07 the fuck
# Lazy load thefuck to keep shell startup fast (0ms)
fuck() {
  unset -f fuck
  eval $(thefuck --alias)
  fuck "$@"
}
