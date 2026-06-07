#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORKER_DAEMON_ENV_FILE="$ROOT_DIR/packages/worker-daemon/.env"

AIWORKER_HOME="${AIWORKER_HOME:-$HOME/.aiworker-dev}"
AIWORKER_HOST="${AIWORKER_HOST:-127.0.0.1}"
AIWORKER_WORKER_HOST="${AIWORKER_WORKER_HOST:-$AIWORKER_HOST}"
PORT="${PORT:-9217}"
AIWORKER_WEB_PORT="${AIWORKER_WEB_PORT:-5173}"
AIWORKER_API_URL="${AIWORKER_API_URL:-http://${AIWORKER_HOST}:${PORT}}"
AIWORKER_WORKER_MANIFEST="${AIWORKER_WORKER_MANIFEST:-${AIWORKER_HOME}/dev-worker.json}"
AIWORKER_WORKER_WEB_TMUX_SESSION="${AIWORKER_WORKER_WEB_TMUX_SESSION:-aiworker-vite-worker}"

DAEMON_PID=""
WEB_PID=""

listener_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

require_tmux() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "[dev] tmux is required for Worker Web dev server" >&2
    exit 1
  fi
}

shell_quote() {
  printf '%q' "$1"
}

process_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true
}

is_path_inside_root() {
  local candidate="$1"

  [[ "$candidate" == "$ROOT_DIR" || "$candidate" == "$ROOT_DIR/"* ]]
}

is_aiworker_dev_daemon_process() {
  local command="$1"
  local cwd="$2"

  if [[ "$command" == *"apps/worker-cli/src/aiworker.ts daemon foreground"* ]] && is_path_inside_root "$cwd"; then
    return 0
  fi

  return 1
}

remove_daemon_metadata_files() {
  rm -f "${AIWORKER_HOME}/aiworker-daemon.pid" "${AIWORKER_HOME}/aiworker-daemon.json"
}

read_existing_daemon_pid() {
  local pid_file="${AIWORKER_HOME}/aiworker-daemon.pid"
  local pid

  if [[ ! -s "$pid_file" ]]; then
    return 1
  fi

  pid="$(tr -d '[:space:]' < "$pid_file")"
  if [[ "$pid" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$pid"
    return 0
  fi

  return 1
}

stop_verified_dev_daemon() {
  local pid
  local command
  local cwd

  if ! pid="$(read_existing_daemon_pid)"; then
    remove_daemon_metadata_files
    return 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    remove_daemon_metadata_files
    return 0
  fi

  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  cwd="$(process_cwd "$pid")"
  if is_aiworker_dev_daemon_process "$command" "$cwd"; then
    (
      cd "$ROOT_DIR"
      AIWORKER_HOME="$AIWORKER_HOME" \
        bun apps/worker-cli/src/aiworker.ts daemon stop >/dev/null 2>&1 || true
    )
  else
    echo "[dev] ignoring non-AIWorker daemon pid file pid=$pid command=$command"
    remove_daemon_metadata_files
  fi
}

kill_matching_aiworker_listener() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  for pid in $pids; do
    local command
    local cwd
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    cwd="$(process_cwd "$pid")"

    if is_aiworker_dev_daemon_process "$command" "$cwd"; then
      echo "[dev] stopping stale AIWorker daemon pid=$pid port=$port"
      kill -TERM "$pid" 2>/dev/null || true
    else
      echo "[dev] skip pid=$pid port=$port command=$command"
    fi
  done
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

restart_existing_dev_daemon() {
  echo "[dev] restarting existing daemon for AIWORKER_HOME=$AIWORKER_HOME"
  stop_verified_dev_daemon
  kill_matching_aiworker_listener "$PORT"
  sleep 1
}

stop_worker_web_tmux() {
  tmux kill-session -t "$AIWORKER_WORKER_WEB_TMUX_SESSION" 2>/dev/null || true
}

restart_worker_web_tmux() {
  stop_worker_web_tmux
  tmux new-session \
    -d \
    -s "$AIWORKER_WORKER_WEB_TMUX_SESSION" \
    -c "$ROOT_DIR/apps/worker-web" \
    "AIWORKER_API_URL=$(shell_quote "$AIWORKER_API_URL") bun run dev --host $(shell_quote "$AIWORKER_HOST") --port $(shell_quote "$AIWORKER_WEB_PORT") --strictPort"
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  stop_worker_web_tmux

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

wait_for_web() {
  local url="http://${AIWORKER_HOST}:${AIWORKER_WEB_PORT}/"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "[dev] Worker Web healthcheck timed out: $url"
  return 1
}

default_worker_pid_file() {
  AIWORKER_HOME="$AIWORKER_HOME" bun -e '
import { join, resolve } from "node:path"

const home = process.env.AIWORKER_HOME
if (!home)
  process.exit(1)

const index = await Bun.file(join(home, "fleet.json")).json()
const defaultWorker = index.workers?.find((worker) => worker.id === index.default) ?? index.workers?.[0]
if (!defaultWorker?.home)
  process.exit(1)

const workerHome = defaultWorker.home === "." ? home : resolve(home, defaultWorker.home)
console.log(join(workerHome, "aiworker-daemon.pid"))
'
}

read_daemon_pid() {
  local pid_file
  local pid

  for _ in $(seq 1 20); do
    pid_file="$(default_worker_pid_file)"
    if [[ -s "$pid_file" ]]; then
      pid="$(tr -d '[:space:]' < "$pid_file")"
      if [[ "$pid" =~ ^[0-9]+$ ]]; then
        printf '%s\n' "$pid"
        return 0
      fi
    fi
    sleep 0.1
  done

  echo "[dev] daemon pid file was not created or was invalid: ${pid_file:-<unknown>}" >&2
  return 1
}

default_worker_id() {
  AIWORKER_HOME="$AIWORKER_HOME" bun -e '
import { join } from "node:path"

const home = process.env.AIWORKER_HOME
if (!home)
  process.exit(1)

const index = await Bun.file(join(home, "fleet.json")).json()
const defaultWorker = index.workers?.find((worker) => worker.id === index.default) ?? index.workers?.[0]
if (!defaultWorker?.id)
  process.exit(1)

console.log(defaultWorker.id)
'
}

stop_daemon_after_start_failure() {
  local listener
  local pid

  listener="$(listener_for_port "$PORT")"
  pid="$(printf '%s\n' "$listener" | awk 'NR > 1 { print $2; exit }')"
  if [[ "$pid" =~ ^[0-9]+$ ]]; then
    echo "[dev] cleaning up daemon listener pid=$pid after startup failure" >&2
    kill -TERM "$pid" 2>/dev/null || true
  fi
}

start_daemon_with_worker() {
  echo "[dev] ensuring default Worker and starting daemon via aiworker start"
  (
    cd "$ROOT_DIR"
    AIWORKER_HOME="$AIWORKER_HOME" \
      AIWORKER_WORKER_HOST="$AIWORKER_WORKER_HOST" \
      PORT="$PORT" \
      bun --env-file="$WORKER_DAEMON_ENV_FILE" apps/worker-cli/src/aiworker.ts start --host "$AIWORKER_HOST" --port "$PORT" >/dev/null
  )
  if ! DAEMON_PID="$(read_daemon_pid)"; then
    stop_daemon_after_start_failure
    return 1
  fi
  echo "[dev] daemon pid=$DAEMON_PID"
}

mkdir -p "$AIWORKER_HOME"
require_tmux
restart_existing_dev_daemon
stop_worker_web_tmux
ensure_port_free "$PORT"
ensure_port_free "$AIWORKER_WEB_PORT"

trap cleanup EXIT INT TERM

echo "[dev] AIWORKER_HOME=$AIWORKER_HOME"
echo "[dev] starting daemon on http://${AIWORKER_HOST}:${PORT}"
start_daemon_with_worker

wait_for_health

echo "[dev] starting Worker Web on http://${AIWORKER_HOST}:${AIWORKER_WEB_PORT}"
restart_worker_web_tmux
wait_for_web

mkdir -p "$(dirname "$AIWORKER_WORKER_MANIFEST")"
cat > "$AIWORKER_WORKER_MANIFEST" <<EOF
{
  "profile": "worker",
  "home": "$AIWORKER_HOME",
  "workerId": "$(default_worker_id)",
  "apiUrl": "$AIWORKER_API_URL",
  "webUrl": "http://${AIWORKER_HOST}:${AIWORKER_WEB_PORT}",
  "services": [
    { "kind": "worker-daemon", "port": $PORT, "pid": $DAEMON_PID },
    { "kind": "worker-web", "port": $AIWORKER_WEB_PORT, "tmuxSession": "$AIWORKER_WORKER_WEB_TMUX_SESSION" }
  ]
}
EOF
echo "[dev] manifest=$AIWORKER_WORKER_MANIFEST"

echo
echo "[dev] web: http://${AIWORKER_HOST}:${AIWORKER_WEB_PORT}"
echo "[dev] api: $AIWORKER_API_URL"
echo "[dev] apps: bun run dev:apps"
echo "[dev] tmux: tmux attach -t $AIWORKER_WORKER_WEB_TMUX_SESSION"
echo "[dev] stop: bun run dev:worker:stop"
echo
trap - EXIT INT TERM
exit 0
