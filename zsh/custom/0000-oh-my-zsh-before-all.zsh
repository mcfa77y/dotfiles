# NOTE: This file is prefixed with '0000-' so it is loaded first alphabetically
# by Oh My Zsh. This guarantees helper functions (like cache_completion) and
# variables are defined and available before other custom scripts run.

# Cache shell completions to ~/.zsh/completions (keeps shell startup fast)
cache_completion() {
  local cmd="$1"
  local completion_file="${2:-_$1}"
  local completion_generator="${3:-$cmd completion}"

  if command -v "$cmd" &>/dev/null; then
    local target_dir="$HOME/.zsh/completions"
    local target_file="$target_dir/$completion_file"
    local bin_path="$(whence -p "$cmd")"

    # Resolve pyenv shim to actual binary if applicable
    if [[ "$bin_path" == *".pyenv/shims"* ]] && command -v pyenv &>/dev/null; then
      bin_path="$(pyenv which "$cmd" 2>/dev/null || echo "$bin_path")"
    fi

    # Automatically regenerate if cache file doesn't exist, is empty, or is older than the binary
    if [[ ! -s "$target_file" || ( -n "$bin_path" && "$target_file" -ot "$bin_path" ) ]]; then
      mkdir -p "$target_dir"
      local tmp_file="${target_file}.tmp.$$"
      if eval "$completion_generator" >"$tmp_file" 2>/dev/null && [[ -s "$tmp_file" ]]; then
        mv -f "$tmp_file" "$target_file"
      else
        rm -f "$tmp_file"
      fi
    fi

    if [[ -f "$target_file" && "$completion_file" != _* ]]; then
      source "$target_file"
    fi
  fi
}

# Add a directory to PATH only when it exists and is not already present.
path_prepend() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) export PATH="$dir:$PATH" ;;
  esac
}

# Portable clipboard helpers: macOS, Wayland, then X11.
clipcopy() {
  if command -v pbcopy >/dev/null 2>&1; then
    pbcopy
  elif command -v wl-copy >/dev/null 2>&1; then
    wl-copy
  elif command -v xclip >/dev/null 2>&1; then
    xclip -selection clipboard
  elif command -v xsel >/dev/null 2>&1; then
    xsel --clipboard --input
  else
    cat >/dev/null
    return 1
  fi
}

clippaste() {
  if command -v pbpaste >/dev/null 2>&1; then
    pbpaste
  elif command -v wl-paste >/dev/null 2>&1; then
    wl-paste
  elif command -v xclip >/dev/null 2>&1; then
    xclip -selection clipboard -out
  elif command -v xsel >/dev/null 2>&1; then
    xsel --clipboard --output
  else
    return 1
  fi
}

notify_done() {
  local message="${*:-done}"
  if command -v say >/dev/null 2>&1; then
    say "$message"
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "Done" "$message"
  else
    print -r -- "$message"
  fi
}

# 2024-01-07 the fuck
# Lazy load thefuck to keep shell startup fast (0ms)
fuck() {
  unset -f fuck
  eval $(thefuck --alias)
  fuck "$@"
}
