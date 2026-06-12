# 2026-05-29
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
