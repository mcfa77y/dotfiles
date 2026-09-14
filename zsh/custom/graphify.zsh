# Graphify Query Logging and Stats Configuration

# Enable local query logging (JSONL format)
export GRAPHIFY_QUERY_LOG_ENABLE=1

# Log full response payloads alongside queries to audit context size
export GRAPHIFY_QUERY_LOG_RESPONSES=1

# Path to local query log file (defaults to ~/.cache/graphify-queries.log)
export GRAPHIFY_QUERY_LOG="${GRAPHIFY_QUERY_LOG:-$HOME/.cache/graphify-queries.log}"

# Unalias before definition to prevent zsh alias expansion parse errors
unalias graphify-bench 2>/dev/null
unalias graphify-tail 2>/dev/null

# Helper function for benchmark (auto-locates latest graph.json if none specified)
graphify-bench() {
  local target="${1}"
  if [ -z "$target" ]; then
    if [ -f "graphify-out/graph.json" ]; then
      target="graphify-out/graph.json"
    else
      # Find the most recently modified graph.json inside graphify-out
      target=$(find graphify-out -name "graph.json" -type f 2>/dev/null | tail -n 1)
    fi
  fi

  if [ -n "$target" ] && [ -f "$target" ]; then
    graphify benchmark "$target"
  else
    graphify benchmark "$@"
  fi
}

# Helper functions/aliases for viewing query logs
graphify-tail() {
  mkdir -p "$(dirname "${GRAPHIFY_QUERY_LOG}")" 2>/dev/null
  touch "${GRAPHIFY_QUERY_LOG}"
  tail -f "${GRAPHIFY_QUERY_LOG}" | jq .
}
alias graphify-log="jq -c . '${GRAPHIFY_QUERY_LOG}' 2>/dev/null"
