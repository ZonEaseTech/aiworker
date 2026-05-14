#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AIWORKER_HOME="${AIWORKER_HOME:-$HOME/.aiworker-dev}"
AIWORKER_HOST="${AIWORKER_HOST:-127.0.0.1}"
AIWORKER_WORKER_HOST="${AIWORKER_WORKER_HOST:-$AIWORKER_HOST}"
PORT="${PORT:-9217}"
AIWORKER_WEB_PORT="${AIWORKER_WEB_PORT:-5173}"
AIWORKER_API_URL="${AIWORKER_API_URL:-http://${AIWORKER_HOST}:${PORT}}"

DAEMON_PID=""
WEB_PID=""

listener_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

ensure_port_free() {
  local port="$1"
  local listener
  listener="$(listener_for_port "$port")"
  if [[ -n "$listener" ]]; then
    echo "[dev] port $port is already in use:"
    echo "$listener"
    echo "[dev] run: bun run dev:clean"
    exit 1
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  for pid in "$WEB_PID" "$DAEMON_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  for pid in "$WEB_PID" "$DAEMON_PID"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done

  exit "$status"
}

wait_for_health() {
  local url="${AIWORKER_API_URL}/health"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "$DAEMON_PID" ]] && ! kill -0 "$DAEMON_PID" 2>/dev/null; then
      echo "[dev] daemon exited before becoming healthy"
      wait "$DAEMON_PID" || true
      return 1
    fi
    sleep 0.5
  done

  echo "[dev] daemon healthcheck timed out: $url"
  return 1
}

ensure_port_free "$PORT"
ensure_port_free "$AIWORKER_WEB_PORT"
mkdir -p "$AIWORKER_HOME"

trap cleanup EXIT INT TERM

echo "[dev] AIWORKER_HOME=$AIWORKER_HOME"
echo "[dev] starting daemon on http://${AIWORKER_HOST}:${PORT}"
(
  cd "$ROOT_DIR"
  AIWORKER_HOME="$AIWORKER_HOME" \
    AIWORKER_WORKER_HOST="$AIWORKER_WORKER_HOST" \
    PORT="$PORT" \
    bun apps/cli/src/aiworker.ts daemon foreground --host "$AIWORKER_HOST" --port "$PORT"
) &
DAEMON_PID=$!

wait_for_health

echo "[dev] starting Worker Web on http://${AIWORKER_HOST}:${AIWORKER_WEB_PORT}"
(
  cd "$ROOT_DIR/apps/web"
  AIWORKER_API_URL="$AIWORKER_API_URL" \
    bun run dev --host "$AIWORKER_HOST" --port "$AIWORKER_WEB_PORT"
) &
WEB_PID=$!

echo
echo "[dev] web: http://${AIWORKER_HOST}:${AIWORKER_WEB_PORT}"
echo "[dev] api: $AIWORKER_API_URL"
echo "[dev] apps: bun run dev:apps"
echo "[dev] stop: Ctrl-C"
echo

while kill -0 "$DAEMON_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

status=0
if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
  wait "$DAEMON_PID" || status=$?
elif ! kill -0 "$WEB_PID" 2>/dev/null; then
  wait "$WEB_PID" || status=$?
fi

exit "$status"
