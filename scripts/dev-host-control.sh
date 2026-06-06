#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-status}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

AIWORKER_HOST="${AIWORKER_HOST:-127.0.0.1}"
AIWORKER_HOST_API_PORT="${AIWORKER_HOST_API_PORT:-9117}"
AIWORKER_HOST_WEB_PORT="${AIWORKER_HOST_WEB_PORT:-5050}"
AIWORKER_HOST_API_URL="${AIWORKER_HOST_API_URL:-http://${AIWORKER_HOST}:${AIWORKER_HOST_API_PORT}}"
AIWORKER_HOST_DB="${AIWORKER_HOST_DB:-${HOME}/.aiworker-dev/host.db}"
AIWORKER_HOST_MANIFEST="${AIWORKER_HOST_MANIFEST:-${HOME}/.aiworker-dev/dev-host.json}"
AIWORKER_HOST_WEB_TMUX_SESSION="${AIWORKER_HOST_WEB_TMUX_SESSION:-aiworker-vite-host}"

listener_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

process_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true
}

is_path_inside_root() {
  local candidate="$1"

  [[ "$candidate" == "$ROOT_DIR" || "$candidate" == "$ROOT_DIR/"* ]]
}

is_aiworker_host_dev_process() {
  local command="$1"
  local cwd="$2"

  if [[ "$command" == *"apps/host-cli/src/aiworker-host.ts serve"* ]] && is_path_inside_root "$cwd"; then
    return 0
  fi

  if [[ "$command" == *"apps/host-cli/src/aiworker-host.ts daemon foreground"* ]] && is_path_inside_root "$cwd"; then
    return 0
  fi

  if [[ "$cwd" == "$ROOT_DIR/apps/host-web"* && "$command" == *"vite"* ]]; then
    return 0
  fi

  return 1
}

print_status() {
  echo "[dev:host:status] Host API: $AIWORKER_HOST_API_URL"
  echo "[dev:host:status] Host Web: http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}/host"
  echo "[dev:host:status] Host DB: $AIWORKER_HOST_DB"

  if curl -fsS "${AIWORKER_HOST_API_URL}/host" >/dev/null 2>&1; then
    echo "[dev:host:status] api: reachable"
  else
    echo "[dev:host:status] api: not reachable"
  fi

  echo
  echo "[dev:host:status] tmux:"
  if tmux has-session -t "$AIWORKER_HOST_WEB_TMUX_SESSION" 2>/dev/null; then
    echo "  $AIWORKER_HOST_WEB_TMUX_SESSION: running"
  else
    echo "  $AIWORKER_HOST_WEB_TMUX_SESSION: missing"
  fi

  echo
  echo "[dev:host:status] listeners:"
  for port in "$AIWORKER_HOST_API_PORT" "$AIWORKER_HOST_WEB_PORT"; do
    listener="$(listener_for_port "$port")"
    if [[ -n "$listener" ]]; then
      echo "$listener"
    else
      echo "  port $port: none"
    fi
  done

  echo
  echo "[dev:host:status] manifest:"
  if [[ -f "$AIWORKER_HOST_MANIFEST" ]]; then
    cat "$AIWORKER_HOST_MANIFEST"
  else
    echo "  $AIWORKER_HOST_MANIFEST: missing"
  fi
}

stop_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "$pids" ]]; then
    echo "[dev:host:stop] port $port: clean"
    return 0
  fi

  for pid in $pids; do
    local command
    local cwd
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    cwd="$(process_cwd "$pid")"

    if is_aiworker_host_dev_process "$command" "$cwd"; then
      echo "[dev:host:stop] stopping pid=$pid port=$port command=$command"
      kill -TERM "$pid" 2>/dev/null || true
    else
      echo "[dev:host:stop] skip pid=$pid port=$port command=$command"
    fi
  done
}

stop_host() {
  tmux kill-session -t aiworker-host-api 2>/dev/null || true
  tmux kill-session -t "$AIWORKER_HOST_WEB_TMUX_SESSION" 2>/dev/null || true
  stop_port "$AIWORKER_HOST_API_PORT"
  stop_port "$AIWORKER_HOST_WEB_PORT"
}

case "$MODE" in
  status)
    print_status
    ;;
  stop)
    stop_host
    ;;
  clean)
    stop_host
    rm -f "$AIWORKER_HOST_MANIFEST"
    echo "[dev:host:clean] removed manifest $AIWORKER_HOST_MANIFEST"
    ;;
  *)
    echo "usage: $0 status|stop|clean" >&2
    exit 1
    ;;
esac
