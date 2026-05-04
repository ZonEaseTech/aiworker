#!/usr/bin/env bash
# fake-claude shim:
# 1. dump argv / pwd / env / stdin to $DEBUG_ROOT/dump/claude-<ts>-<pid>.txt
# 2. tee stdin so real claude still receives it
# 3. exec real claude with original argv
#
# 用法：
#   cp claude-shim.sh $DEBUG_ROOT/bin/claude && chmod +x $DEBUG_ROOT/bin/claude
#   export PATH="$DEBUG_ROOT/bin:$PATH"
#   which claude   # 必须返回 $DEBUG_ROOT/bin/claude
#
# 然后正常跑 aiworker run，所有 claude 子进程的 stdin / argv / env 都会落盘到 dump/。

# 由 aiworker-release-debug skill 维护，结构变更同步更新 references/recipes.md

set -u

# 真 claude 路径（如果不在标准位置可改这里）
REAL_CLAUDE="${REAL_CLAUDE:-/home/ben/.npm-global/bin/claude}"

# dump 目录：默认放在 $DEBUG_ROOT，由调用方设置；fallback 到 /tmp
DUMP_DIR="${AIWORKER_DEBUG_DUMP_DIR:-${DEBUG_ROOT:-/tmp}/dump}"
mkdir -p "$DUMP_DIR"

TS=$(date +%s%N)
LOG="$DUMP_DIR/claude-${TS}-$$.txt"

{
  echo "=== ARGV ==="
  for a in "$@"; do printf '  %q\n' "$a"; done
  echo "=== PWD ==="
  pwd
  echo "=== ENV (filtered) ==="
  env | grep -iE '^(AIWORKER|CLAUDE|ANTHROPIC|HOME|PATH|MODEL|TASK|NODE_OPTIONS)' | sort
  echo "=== STDIN ==="
} > "$LOG"

# tee stdin：把 stdin 同时写到 LOG（追加）和喂给真 claude
exec "$REAL_CLAUDE" "$@" < <(tee -a "$LOG")
