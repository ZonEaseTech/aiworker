#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export AIWORKER_HOME="${AIWORKER_HOME:-$HOME/.aiworker-dev}"

cd "$ROOT_DIR"

echo "[dev:apps] AIWORKER_HOME=$AIWORKER_HOME"

run_cli() {
  local output
  if ! output="$(bun apps/worker-cli/src/aiworker.ts "$@" 2>&1)"; then
    echo "$output"
    exit 1
  fi
}

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
  const prefix = app.mountedContribution?.apiRoutePrefix ?? "no mounted api"
  console.log(`  ${app.appId}: ${app.status}, health=${app.healthStatus}, api=${prefix}`)
}
'
}

run_cli app bootstrap official

echo "[dev:apps] enabled apps:"
bun apps/worker-cli/src/aiworker.ts app list | format_apps
