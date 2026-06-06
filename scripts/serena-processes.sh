#!/usr/bin/env bash
set -euo pipefail

action="${1:-status}"
patterns=(
  "serena start-mcp-server"
  "typescript-language-server --stdio"
)

matching_pids() {
  local pattern pid
  for pattern in "${patterns[@]}"; do
    pgrep -f "$pattern" || true
  done | awk '!seen[$0]++'
}

show_processes() {
  local pids
  pids="$(matching_pids)"
  if [[ -z "$pids" ]]; then
    echo "No Serena MCP or TypeScript language-server processes found."
    return
  fi

  ps -o pid,ppid,rss,etime,command -p "$(echo "$pids" | paste -sd, -)"
}

case "$action" in
  status|ps)
    show_processes
    ;;
  clean)
    pids="$(matching_pids)"
    if [[ -z "$pids" ]]; then
      echo "No Serena MCP or TypeScript language-server processes to clean."
      exit 0
    fi

    echo "Cleaning Serena-related processes:"
    ps -o pid,ppid,rss,etime,command -p "$(echo "$pids" | paste -sd, -)"
    echo "$pids" | xargs kill 2>/dev/null || true
    ;;
  *)
    echo "Usage: bash scripts/serena-processes.sh [status|clean]" >&2
    exit 2
    ;;
esac
