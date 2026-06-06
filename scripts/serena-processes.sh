#!/usr/bin/env bash
set -euo pipefail

action="${1:-status}"
project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
scope="${AIWORKER_SERENA_SCOPE:-project}"
patterns=(
  "serena start-mcp-server"
  "typescript-language-server --stdio"
)

pid_cwd() {
  local pid="$1"
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { sub(/^n/, ""); print; exit }'
}

pid_in_scope() {
  local pid="$1" cwd

  if [[ "$scope" == "all" ]]; then
    return 0
  fi

  cwd="$(pid_cwd "$pid")"
  [[ "$cwd" == "$project_root" || "$cwd" == "$project_root/"* ]]
}

matching_pids() {
  local pattern pid
  for pattern in "${patterns[@]}"; do
    pgrep -f "$pattern" || true
  done | awk '!seen[$0]++' | while read -r pid; do
    if pid_in_scope "$pid"; then
      echo "$pid"
    fi
  done
}

show_processes() {
  local pids
  pids="$(matching_pids)"
  if [[ -z "$pids" ]]; then
    echo "No Serena MCP or TypeScript language-server processes found for scope '$scope'."
    return
  fi

  echo "Scope: $scope ($project_root)"
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
    echo "Scope: $scope ($project_root)"
    ps -o pid,ppid,rss,etime,command -p "$(echo "$pids" | paste -sd, -)"
    echo "$pids" | xargs kill 2>/dev/null || true
    ;;
  *)
    echo "Usage: bash scripts/serena-processes.sh [status|clean]" >&2
    exit 2
    ;;
esac
