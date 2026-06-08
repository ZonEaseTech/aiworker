#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-stop}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AIWORKER_HOME="${AIWORKER_HOME:-$HOME/.aiworker-dev}"
PORT="${PORT:-9217}"
AIWORKER_WEB_PORT="${AIWORKER_WEB_PORT:-5173}"
AIWORKER_WORKER_MANIFEST="${AIWORKER_WORKER_MANIFEST:-${AIWORKER_HOME}/dev-worker.json}"
AIWORKER_WORKER_WEB_TMUX_SESSION="${AIWORKER_WORKER_WEB_TMUX_SESSION:-aiworker-vite-worker}"

export AIWORKER_HOME

cd "$ROOT_DIR"

echo "[dev:clean] AIWORKER_HOME=$AIWORKER_HOME"
bun apps/worker-cli/src/aiworker.ts daemon stop || true
tmux kill-session -t "$AIWORKER_WORKER_WEB_TMUX_SESSION" 2>/dev/null || true

process_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

is_aiworker_dev_process() {
  local pid="$1"
  local command="$2"
  local cwd="$3"

  if [[ "$command" == *"apps/worker-cli/src/aiworker.ts daemon foreground"* ]]; then
    return 0
  fi

  if [[ "$cwd" == "$ROOT_DIR/apps/worker-web"* && "$command" == *"vite"* ]]; then
    return 0
  fi

  if [[ "$cwd" == "$ROOT_DIR"* && "$command" == *"apps/worker-cli/src/aiworker.ts"* ]]; then
    return 0
  fi

  return 1
}

kill_matching_listener() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "$pids" ]]; then
    echo "[dev:clean] port $port: clean"
    return 0
  fi

  for pid in $pids; do
    local command
    local cwd
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    cwd="$(process_cwd "$pid")"

    if is_aiworker_dev_process "$pid" "$command" "$cwd"; then
      echo "[dev:clean] stopping pid=$pid port=$port command=$command"
      kill -TERM "$pid" 2>/dev/null || true
    else
      echo "[dev:clean] skip pid=$pid port=$port command=$command"
    fi
  done
}

kill_matching_listener "$PORT"
kill_matching_listener "$AIWORKER_WEB_PORT"

sleep 1

echo
echo "[dev:clean] remaining listeners:"
remaining=0
for port in "$PORT" "$AIWORKER_WEB_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null; then
    remaining=1
  else
    echo "  port $port: none"
  fi
done

if [[ "$MODE" == "clean" ]]; then
  rm -f "$AIWORKER_WORKER_MANIFEST"
  echo "[dev:clean] removed manifest $AIWORKER_WORKER_MANIFEST"
fi

exit "$remaining"
