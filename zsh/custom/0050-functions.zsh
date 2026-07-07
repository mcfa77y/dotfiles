# --- Process Utilities ---
# Script to kill a process using a specified port
kill_by_port() {
  # Check if a port number is provided as an argument
  if [ -z "$1" ]; then
    echo "Usage: kill_by_port <port_number>"
    return 1
  fi

  # Validate that the argument is a number
  if ! [[ "$1" =~ ^[0-9]+$ ]]; then
    echo "Error: Port number must be a valid integer."
    return 1
  fi

  # The port number to target
  PORT="$1"

  # Find the PID of the process using the specified port
  PID=$(lsof -i :"$PORT" | grep LISTEN | awk '{print $2}')

  # Check if a PID was found
  if [ -z "$PID" ]; then
    echo "No process found listening on port $PORT"
    return 1
  fi

  # Kill the process
  echo "Killing process with PID: $PID"
  kill "$PID"

  # Check if the process was successfully killed (polling for up to 1 second)
  local count=0
  while ps -p "$PID" >/dev/null 2>&1; do
    if [ "$count" -ge 10 ]; then
      echo "Process with PID $PID was not killed."
      return 1
    fi
    sleep 0.1
    count=$((count + 1))
  done

  echo "Process with PID $PID successfully killed."
}

# --- Directory Utilities ---
# Traverse up the directory tree to find a specific parent folder and cd into it
goto_parent_directory() {
  local target_dir="${1:-my_target_folder}"
  local current_dir="$PWD"
  while [[ "$current_dir" != "/" && "$current_dir" != "" ]]; do
    local base
    base="$(basename "$current_dir")"
    if [[ "$base" == "$target_dir" ]]; then
      cd "$current_dir" || return 1
      return 0
    fi
    current_dir="$(dirname "$current_dir")"
  done
  echo "Target folder '$target_dir' not found" >&2
  return 1
}

# --- Yazi File Manager Integration ---
# allows yazi to enter cwd upon quit
yzi() {
  local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
  yazi "$@" --cwd-file="$tmp"
  IFS= read -r -d '' cwd <"$tmp"
  [ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && builtin cd -- "$cwd"
  rm -f -- "$tmp"
}

# --- Startup Banner ---
# Run figlet preview on shell load
if [[ -n "$JS_DIR" && -d "$JS_DIR/figletPreview" ]]; then
  ~/.bun/bin/bun run --cwd "$JS_DIR/figletPreview" start --text Fresh
fi
