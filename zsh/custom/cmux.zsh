# 2026-06-23
# folder dirname
alias cmux-set-workspace-name='cmux workspace rename --title "$(basename $PWD)" $(cmux current-workspace)'
# Custom cmux function for Oh My Zsh
# Usage: cmux-tab --name <tab_name> --command <command_to_run> [--focus] [--cwd <path>]
# Example: cmux-tab --name "BE Server" --command "echo 'new foo'"
# By default, this function creates the new surface in the background, keeping focus on your active tab.
# Use --focus (or -f) to explicitly switch focus to the new tab.
function cmux-tab() {
  local tab_name=""
  local cmd_to_run=""
  local focus_new=false
  local cwd="$PWD"

  while [[ $# -gt 0 ]]; do
    case "$1" in
    -n | --name)
      if [[ -z "$2" ]]; then
        echo "Error: --name requires a value."
        return 1
      fi
      tab_name="$2"
      shift 2
      ;;
    -c | --command | --cmd)
      if [[ -z "$2" ]]; then
        echo "Error: --command requires a value."
        return 1
      fi
      cmd_to_run="$2"
      shift 2
      ;;
    -f | --focus)
      focus_new=true
      shift 1
      ;;
    --cwd)
      if [[ -z "$2" ]]; then
        echo "Error: --cwd requires a value."
        return 1
      fi
      cwd="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: cmux-tab --name <tab_name> --command <command_to_run> [--focus] [--cwd <path>]"
      return 1
      ;;
    esac
  done

  if [[ -z "$tab_name" || -z "$cmd_to_run" ]]; then
    echo "Usage: cmux-tab --name <tab_name> --command <command_to_run> [--focus] [--cwd <path>]"
    return 1
  fi

  # Default is false (retaining focus on active tab). Focus is only set to true if specified.
  local focus_val="false"
  if [[ "$focus_new" == "true" ]]; then
    focus_val="true"
  fi

  # Create the new terminal surface/tab and capture its reference ID from JSON output
  local res
  res=$(cmux new-surface --working-directory "$cwd" --focus "$focus_val" --json 2>/dev/null)
  if [[ $? -ne 0 || -z "$res" ]]; then
    echo "Error: Failed to create new cmux surface. Is cmux running?"
    return 1
  fi

  local surface_ref
  surface_ref=$(echo "$res" | jq -r '.surface_ref' 2>/dev/null)
  if [[ -z "$surface_ref" || "$surface_ref" == "null" ]]; then
    echo "Error: Failed to parse surface reference from cmux output."
    return 1
  fi

  # Rename the tab to the specified name
  cmux rename-tab --surface "$surface_ref" "$tab_name"

  # Send and execute the command in that surface
  cmux send --surface "$surface_ref" "${cmd_to_run}\n"
}

# Get title of the current cmux surface
cmux-current-title() {
  cmux tree 2>/dev/null | grep -F "◀ here" | sed -n 's/.*"\(.*\)".*/\1/p'
}

# Alias for quicker typing
alias ct='cmux-tab'

# 2026-08-19
# Workspace development launcher with omp-empo (left) and nvim (right)
# Usage: cmux-dev [path] [--no-focus] [--omp <command>] [--nvim <command>]
# Example: cmux-dev
# Example: cdev ~/Projects/myrepo
function cmux-dev() {
  local cwd="$PWD"
  local focus_ws=true
  local omp_cmd="omp-empo"
  local nvim_cmd="nvim ."

  while [[ $# -gt 0 ]]; do
    case "$1" in
    -d | --dir | --cwd)
      if [[ -z "$2" ]]; then
        echo "Error: $1 requires a directory path."
        return 1
      fi
      cwd="$2"
      shift 2
      ;;
    -f | --focus)
      focus_ws=true
      shift 1
      ;;
    --no-focus)
      focus_ws=false
      shift 1
      ;;
    --omp)
      if [[ -z "$2" ]]; then
        echo "Error: --omp requires a command."
        return 1
      fi
      omp_cmd="$2"
      shift 2
      ;;
    --nvim)
      if [[ -z "$2" ]]; then
        echo "Error: --nvim requires a command."
        return 1
      fi
      nvim_cmd="$2"
      shift 2
      ;;
    -h | --help)
      echo "Usage: cmux-dev [path] [--no-focus] [--omp <command>] [--nvim <command>]"
      return 0
      ;;
    *)
      if [[ -d "$1" ]]; then
        cwd="$1"
        shift 1
      else
        echo "Unknown option or invalid directory: $1"
        echo "Usage: cmux-dev [path] [--no-focus] [--omp <command>] [--nvim <command>]"
        return 1
      fi
      ;;
    esac
  done

  # Resolve absolute path for directory
  cwd=$(cd "$cwd" 2>/dev/null && pwd) || {
    echo "Error: Directory '$cwd' does not exist."
    return 1
  }

  local folder_name
  folder_name=$(basename "$cwd")

  local branch=""
  if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [[ "$branch" == "HEAD" ]]; then
      branch=$(git -C "$cwd" rev-parse --short HEAD 2>/dev/null || echo "detached")
    fi
  fi

  local ws_title omp_title nvim_title
  if [[ -n "$branch" ]]; then
    ws_title="${folder_name}: ${branch}"
    omp_title="omp ${branch}"
    nvim_title="nvim ${branch}"
  else
    ws_title="${folder_name}"
    omp_title="omp"
    nvim_title="nvim"
  fi

  local focus_val="false"
  if [[ "$focus_ws" == "true" ]]; then
    focus_val="true"
  fi

  # Create new workspace
  local res
  res=$(cmux --json workspace create --name "$ws_title" --cwd "$cwd" --focus "$focus_val" 2>/dev/null)
  if [[ $? -ne 0 || -z "$res" ]]; then
    echo "Error: Failed to create cmux workspace. Is cmux running?"
    return 1
  fi

  local ws_ref left_surface
  ws_ref=$(echo "$res" | jq -r '.workspace_ref // empty')
  left_surface=$(echo "$res" | jq -r '.surface_ref // empty')

  if [[ -z "$ws_ref" || -z "$left_surface" ]]; then
    echo "Error: Failed to parse workspace/surface references from cmux output."
    return 1
  fi

  # Setup left pane: rename tab & run omp command
  cmux rename-tab --workspace "$ws_ref" --surface "$left_surface" "$omp_title" >/dev/null 2>&1
  cmux send --workspace "$ws_ref" --surface "$left_surface" "${omp_cmd}\n" >/dev/null 2>&1

  # Create right pane split
  local pane_res right_surface
  pane_res=$(cmux --json new-pane --workspace "$ws_ref" --type terminal --direction right --focus false 2>/dev/null)
  right_surface=$(echo "$pane_res" | jq -r '.surface_ref // empty')

  if [[ -n "$right_surface" ]]; then
    cmux rename-tab --workspace "$ws_ref" --surface "$right_surface" "$nvim_title" >/dev/null 2>&1
    cmux send --workspace "$ws_ref" --surface "$right_surface" "${nvim_cmd}\n" >/dev/null 2>&1
  fi
}

alias cdev='cmux-dev'
