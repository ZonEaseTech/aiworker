#!/usr/bin/env sh
set -u

resolve_script_dir() {
  target=$1
  while [ -L "$target" ]; do
    dir=$(CDPATH= cd -P "$(dirname "$target")" 2>/dev/null && pwd) || return 1
    target=$(readlink "$target") || return 1
    case "$target" in
      /*) ;;
      *) target="$dir/$target" ;;
    esac
  done
  CDPATH= cd -P "$(dirname "$target")" 2>/dev/null && pwd
}

try_exec_bun() {
  bun_bin=$1
  shift
  if [ -n "$bun_bin" ] && [ -x "$bun_bin" ]; then
    exec "$bun_bin" "$AIWORKER_HOST_BUN_BUNDLE" "$@"
  fi
}

AIWORKER_HOST_SHIM_DIR=$(resolve_script_dir "$0")
AIWORKER_HOST_BUN_BUNDLE="$AIWORKER_HOST_SHIM_DIR/aiworker-host-bun.js"

try_exec_bun "${AIWORKER_BUN_BIN:-}" "$@"

if command -v bun >/dev/null 2>&1; then
  exec "$(command -v bun)" "$AIWORKER_HOST_BUN_BUNDLE" "$@"
fi

if [ -n "${BUN_INSTALL:-}" ]; then
  try_exec_bun "$BUN_INSTALL/bin/bun" "$@"
fi

if [ -n "${HOME:-}" ]; then
  try_exec_bun "$HOME/.bun/bin/bun" "$@"
fi

AIWORKER_HOST_ARGS_DISPLAY=${*:-"--help"}

cat >&2 <<EOF
[aiworker-host] Bun runtime was not found.

AIWorker Host CLI is Bun-native. Install Bun and make sure "bun" is on PATH:
  curl -fsSL https://bun.sh/install | bash

Then retry:
  npx @zonease/aiworker-host-cli $AIWORKER_HOST_ARGS_DISPLAY
  bunx @zonease/aiworker-host-cli $AIWORKER_HOST_ARGS_DISPLAY

For a custom Bun path:
  AIWORKER_BUN_BIN=/path/to/bun npx @zonease/aiworker-host-cli $AIWORKER_HOST_ARGS_DISPLAY
EOF

exit 127
