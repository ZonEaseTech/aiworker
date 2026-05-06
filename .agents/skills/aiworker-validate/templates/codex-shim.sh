#!/bin/bash
# fake-codex shim：cross-engine 验证用，结构与 claude-shim 同源。
#
# codex executor 走 jsonrpc app-server 模式：argv 是 `app-server`，stdin 是 jsonrpc stream，
# brain 嵌入 turn/start 的 input 字段（`<System>...</System>\n\n<User>...</User>`）。
# 这与 claude-code 用 `--append-system-prompt` 完全不同，所以必须独立抓 stdin 比对。
#
# 用法：
#   sed -i "s#__DUMP_DIR__#$DEBUG_ROOT/dump#" $DEBUG_ROOT/bin/codex
#   chmod +x $DEBUG_ROOT/bin/codex
#   export PATH="$DEBUG_ROOT/bin:$PATH"
#   which codex   # 必须返回 $DEBUG_ROOT/bin/codex
#
# 由 aiworker-validate skill 维护。结构变更同步更新 references/release-debug-recipes.md。

set -u

# 真 codex 路径（如果不在标准位置可改这里）
REAL_CODEX="/home/ben/.npm-global/bin/codex"

DUMP_DIR="__DUMP_DIR__"

if [ "$DUMP_DIR" = "__DUMP_DIR__" ]; then
  echo "[codex-shim] ERROR: DUMP_DIR not initialized. Run 'sed -i s#__DUMP_DIR__#<absolute>#' before exec." >&2
  exit 78
fi

mkdir -p "$DUMP_DIR"

TS=$(date +%s%N)
LOG="$DUMP_DIR/codex-${TS}-$$.txt"

{
  echo "=== ARGV ==="
  for a in "$@"; do printf '  %q\n' "$a"; done
  echo "=== PWD ==="
  pwd
  echo "=== ENV (filtered) ==="
  env | grep -iE '^(AIWORKER|CODEX|OPENAI|HOME|PATH|MODEL|TASK|NODE_OPTIONS)' | sort
  echo "=== STDIN ==="
} > "$LOG"

exec "$REAL_CODEX" "$@" < <(tee -a "$LOG")
