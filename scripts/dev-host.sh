#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

AIWORKER_HOST="${AIWORKER_HOST:-127.0.0.1}"
AIWORKER_HOST_API_PORT="${AIWORKER_HOST_API_PORT:-9117}"
AIWORKER_HOST_WEB_PORT="${AIWORKER_HOST_WEB_PORT:-5050}"
AIWORKER_HOST_API_URL="${AIWORKER_HOST_API_URL:-http://${AIWORKER_HOST}:${AIWORKER_HOST_API_PORT}}"
AIWORKER_HOST_DB="${AIWORKER_HOST_DB:-${HOME}/.aiworker-dev/host.db}"
AIWORKER_HOST_MANIFEST="${AIWORKER_HOST_MANIFEST:-${HOME}/.aiworker-dev/dev-host.json}"
AIWORKER_HOST_LOG_DIR="${AIWORKER_HOST_LOG_DIR:-$(dirname "$AIWORKER_HOST_MANIFEST")}"
AIWORKER_HOST_DAEMON_LOG="${AIWORKER_HOST_DAEMON_LOG:-${AIWORKER_HOST_LOG_DIR}/host-daemon.log}"
AIWORKER_HOST_DEV_ADMIN_EMAIL="${AIWORKER_HOST_DEV_ADMIN_EMAIL:-admin@example.com}"
AIWORKER_HOST_WEB_TMUX_SESSION="${AIWORKER_HOST_WEB_TMUX_SESSION:-aiworker-vite-host}"

DAEMON_PID=""

listener_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

require_tmux() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "[dev:host] tmux is required for Host Web dev server" >&2
    exit 1
  fi
}

shell_quote() {
  printf '%q' "$1"
}

ensure_port_free() {
  local port="$1"
  local listener
  listener="$(listener_for_port "$port")"
  if [[ -n "$listener" ]]; then
    echo "[dev:host] port $port is already in use:"
    echo "$listener"
    exit 1
  fi
}

ensure_distinct_ports() {
  if [[ "$AIWORKER_HOST_API_PORT" == "$AIWORKER_HOST_WEB_PORT" ]]; then
    echo "[dev:host] Host API and Web ports must not be the same: $AIWORKER_HOST_API_PORT" >&2
    exit 1
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  tmux kill-session -t "$AIWORKER_HOST_WEB_TMUX_SESSION" 2>/dev/null || true

  if [[ -n "$DAEMON_PID" ]] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    kill -TERM "$DAEMON_PID" 2>/dev/null || true
  fi

  exit "$status"
}

wait_for_host_api() {
  local url="${AIWORKER_HOST_API_URL}/host"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "[dev:host] Host API healthcheck timed out: $url"
  return 1
}

wait_for_host_web() {
  local url="http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}/host"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "[dev:host] Host Web healthcheck timed out: $url"
  return 1
}

stop_legacy_host_api_tmux() {
  tmux kill-session -t aiworker-host-api 2>/dev/null || true
}

start_host_daemon_background() {
  echo "[dev:host] starting Host daemon on ${AIWORKER_HOST_API_URL}"
  mkdir -p "$(dirname "$AIWORKER_HOST_DAEMON_LOG")"
  local seed_args=()
  if [[ -n "${AIWORKER_HOST_SEED_SOULS_DIR:-}" ]]; then
    seed_args+=(--seed-souls-dir "$AIWORKER_HOST_SEED_SOULS_DIR")
  fi
  (
    cd "$ROOT_DIR"
    exec bun apps/host-cli/src/aiworker-host.ts daemon foreground \
      --dev \
      --db "$AIWORKER_HOST_DB" \
      --dev-admin-email "$AIWORKER_HOST_DEV_ADMIN_EMAIL" \
      --host "$AIWORKER_HOST" \
      --manifest "$AIWORKER_HOST_MANIFEST" \
      --public-base-url "$AIWORKER_HOST_API_URL" \
      --port "$AIWORKER_HOST_API_PORT" \
      --web-port "$AIWORKER_HOST_WEB_PORT" \
      "${seed_args[@]}" \
      >> "$AIWORKER_HOST_DAEMON_LOG" 2>&1
  ) &
  DAEMON_PID=$!
  echo "[dev:host] Host daemon pid=$DAEMON_PID log=$AIWORKER_HOST_DAEMON_LOG"
}

restart_host_web_tmux() {
  echo "[dev:host] starting Host Web on http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}"
  tmux kill-session -t "$AIWORKER_HOST_WEB_TMUX_SESSION" 2>/dev/null || true
  tmux new-session \
    -d \
    -s "$AIWORKER_HOST_WEB_TMUX_SESSION" \
    -c "$ROOT_DIR/apps/host-web" \
    "AIWORKER_HOST_API_URL=$(shell_quote "$AIWORKER_HOST_API_URL") bun run dev --host $(shell_quote "$AIWORKER_HOST") --port $(shell_quote "$AIWORKER_HOST_WEB_PORT") --strictPort"
}

write_host_manifest() {
  mkdir -p "$(dirname "$AIWORKER_HOST_MANIFEST")"
  cat > "$AIWORKER_HOST_MANIFEST" <<EOF
{
  "profile": "host",
  "apiUrl": "$AIWORKER_HOST_API_URL",
  "webUrl": "http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}/host",
  "db": "$AIWORKER_HOST_DB",
  "services": [
    { "kind": "host-daemon", "port": $AIWORKER_HOST_API_PORT, "pid": $DAEMON_PID, "logFile": "$AIWORKER_HOST_DAEMON_LOG" },
    { "kind": "host-web", "port": $AIWORKER_HOST_WEB_PORT, "tmuxSession": "$AIWORKER_HOST_WEB_TMUX_SESSION" }
  ]
}
EOF
  echo "[dev:host] manifest=$AIWORKER_HOST_MANIFEST"
}

mkdir -p "$(dirname "$AIWORKER_HOST_DB")"
ensure_distinct_ports
require_tmux
tmux kill-session -t "$AIWORKER_HOST_WEB_TMUX_SESSION" 2>/dev/null || true
stop_legacy_host_api_tmux
ensure_port_free "$AIWORKER_HOST_API_PORT"
ensure_port_free "$AIWORKER_HOST_WEB_PORT"

trap cleanup EXIT INT TERM

echo "[dev:host] AIWORKER_HOST_DB=$AIWORKER_HOST_DB"
echo "[dev:host] AIWORKER_HOST_DEV_ADMIN_EMAIL=$AIWORKER_HOST_DEV_ADMIN_EMAIL"

start_host_daemon_background
wait_for_host_api
ensure_port_free "$AIWORKER_HOST_WEB_PORT"
restart_host_web_tmux
wait_for_host_web
write_host_manifest

echo
echo "[dev:host] web: http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}/host"
echo "[dev:host] api: $AIWORKER_HOST_API_URL"
echo "[dev:host] daemon log: $AIWORKER_HOST_DAEMON_LOG"
echo "[dev:host] tmux web: tmux attach -t $AIWORKER_HOST_WEB_TMUX_SESSION"
echo "[dev:host] stop: bun run dev:host:stop"
echo

trap - EXIT INT TERM
exit 0
