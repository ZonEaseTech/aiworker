#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

AIWORKER_HOST="${AIWORKER_HOST:-127.0.0.1}"
AIWORKER_HOST_API_PORT="${AIWORKER_HOST_API_PORT:-9117}"
AIWORKER_HOST_WEB_PORT="${AIWORKER_HOST_WEB_PORT:-5050}"
AIWORKER_HOST_API_URL="${AIWORKER_HOST_API_URL:-http://${AIWORKER_HOST}:${AIWORKER_HOST_API_PORT}}"
AIWORKER_HOST_DB="${AIWORKER_HOST_DB:-${HOME}/.aiworker-dev/host.db}"
AIWORKER_HOST_DEV_ADMIN_EMAIL="${AIWORKER_HOST_DEV_ADMIN_EMAIL:-admin@zonease.org}"

API_PID=""
WEB_PID=""

listener_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
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

  for pid in "$WEB_PID" "$API_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  for pid in "$WEB_PID" "$API_PID"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done

  exit "$status"
}

wait_for_host_api() {
  local url="${AIWORKER_HOST_API_URL}/host"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "$API_PID" ]] && ! kill -0 "$API_PID" 2>/dev/null; then
      echo "[dev:host] Host API exited before becoming reachable"
      wait "$API_PID" || true
      return 1
    fi
    sleep 0.5
  done

  echo "[dev:host] Host API healthcheck timed out: $url"
  return 1
}

start_host_api() {
  echo "[dev:host] starting Host API on ${AIWORKER_HOST_API_URL}"
  (
    cd "$ROOT_DIR"
    bun apps/host-cli/src/aiworker-host.ts serve \
      --db "$AIWORKER_HOST_DB" \
      --dev-admin-email "$AIWORKER_HOST_DEV_ADMIN_EMAIL" \
      --public-base-url "$AIWORKER_HOST_API_URL" \
      --port "$AIWORKER_HOST_API_PORT"
  ) &
  API_PID=$!
  echo "[dev:host] Host API pid=$API_PID"
}

start_host_web() {
  echo "[dev:host] starting Host Web on http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}"
  (
    cd "$ROOT_DIR/apps/host-web"
    AIWORKER_HOST_API_URL="$AIWORKER_HOST_API_URL" \
      bun run dev --host "$AIWORKER_HOST" --port "$AIWORKER_HOST_WEB_PORT" --strictPort
  ) &
  WEB_PID=$!
  echo "[dev:host] Host Web pid=$WEB_PID"
}

mkdir -p "$(dirname "$AIWORKER_HOST_DB")"
ensure_distinct_ports
ensure_port_free "$AIWORKER_HOST_API_PORT"
ensure_port_free "$AIWORKER_HOST_WEB_PORT"

trap cleanup EXIT INT TERM

echo "[dev:host] AIWORKER_HOST_DB=$AIWORKER_HOST_DB"
echo "[dev:host] AIWORKER_HOST_DEV_ADMIN_EMAIL=$AIWORKER_HOST_DEV_ADMIN_EMAIL"

start_host_api
wait_for_host_api
ensure_port_free "$AIWORKER_HOST_WEB_PORT"
start_host_web

while true; do
  if [[ -n "$API_PID" ]] && ! kill -0 "$API_PID" 2>/dev/null; then
    echo "[dev:host] Host API process exited"
    wait "$API_PID" || true
    exit 1
  fi

  if [[ -n "$WEB_PID" ]] && ! kill -0 "$WEB_PID" 2>/dev/null; then
    status=0
    echo "[dev:host] Host Web process exited"
    wait "$WEB_PID" || status=$?
    if [[ "$status" -eq 0 ]]; then
      status=1
    fi
    exit "$status"
  fi

  sleep 1
done
