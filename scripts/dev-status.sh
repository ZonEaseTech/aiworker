#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AIWORKER_HOME="${AIWORKER_HOME:-$HOME/.aiworker-dev}"
AIWORKER_HOST="${AIWORKER_HOST:-127.0.0.1}"
PORT="${PORT:-9217}"
AIWORKER_WEB_PORT="${AIWORKER_WEB_PORT:-5173}"
AIWORKER_API_URL="${AIWORKER_API_URL:-http://${AIWORKER_HOST}:${PORT}}"
AIWORKER_WORKER_MANIFEST="${AIWORKER_WORKER_MANIFEST:-${AIWORKER_HOME}/dev-worker.json}"
AIWORKER_WORKER_WEB_TMUX_SESSION="${AIWORKER_WORKER_WEB_TMUX_SESSION:-aiworker-vite-worker}"

export AIWORKER_HOME

cd "$ROOT_DIR"

echo "[dev:status] AIWORKER_HOME=$AIWORKER_HOME"
echo "[dev:status] api: $AIWORKER_API_URL"

if curl -fsS "${AIWORKER_API_URL}/health" >/dev/null 2>&1; then
  echo "[dev:status] daemon: healthy"
else
  echo "[dev:status] daemon: not reachable"
fi

echo
echo "[dev:status] listeners:"
for port in "$PORT" "$AIWORKER_WEB_PORT"; do
  if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null; then
    echo "  port $port: none"
  fi
done

echo
echo "[dev:status] tmux:"
if tmux has-session -t "$AIWORKER_WORKER_WEB_TMUX_SESSION" 2>/dev/null; then
  echo "  $AIWORKER_WORKER_WEB_TMUX_SESSION: running"
else
  echo "  $AIWORKER_WORKER_WEB_TMUX_SESSION: missing"
fi

echo
echo "[dev:status] installed apps:"
format_apps() {
  bun -e '
let input = ""
const decoder = new TextDecoder()
for await (const chunk of Bun.stdin.stream())
  input += decoder.decode(chunk)
const apps = JSON.parse(input).apps ?? []
if (apps.length === 0) {
  console.log("  none")
  process.exit(0)
}
for (const app of apps) {
  console.log(`  ${app.appId}: ${app.status}, health=${app.healthStatus}, api=no app api`)
}
'
}

bun apps/worker-cli/src/aiworker.ts app list | format_apps

echo
echo "[dev:status] manifest:"
if [[ -f "$AIWORKER_WORKER_MANIFEST" ]]; then
  cat "$AIWORKER_WORKER_MANIFEST"
else
  echo "  $AIWORKER_WORKER_MANIFEST: missing"
fi
