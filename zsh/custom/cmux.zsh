# 2026-06-23
# folder dirname
alias folder_name="basename $PWD"
alias cmux-set-workspace-name='cmux workspace rename --title "$(folder_name)" $(cmux current-workspace)'
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
