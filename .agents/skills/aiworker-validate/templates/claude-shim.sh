#!/bin/bash
# fake-claude shim:
# 1. dump argv / pwd / env / stdin to <hard-coded DUMP_DIR>/claude-<ts>-<pid>.txt
# 2. tee stdin so real claude still receives it
# 3. exec real claude with original argv
#
# 用法（每次新 campaign 复制后必须 hard-code DUMP_DIR 到当 campaign 的 absolute 路径）：
#   sed -i "s#__DUMP_DIR__#$DEBUG_ROOT/dump#" $DEBUG_ROOT/bin/claude
#   chmod +x $DEBUG_ROOT/bin/claude
#   export PATH="$DEBUG_ROOT/bin:$PATH"
#   which claude   # 必须返回 $DEBUG_ROOT/bin/claude
#
# 然后正常跑 aiworker run，所有 claude 子进程的 stdin / argv / env 都会落盘到 dump/。
#
# 由 aiworker-validate skill 维护。结构变更同步更新 references/release-debug-recipes.md。
#
# === 重要约束 ===
#
# 1. shebang 必须 `#!/bin/bash` 绝对路径，不要 `#!/usr/bin/env bash`
#    engine adapter 给 child 进程的 PATH 经过 sandbox，env 找不到 bash 时 shim 会 silent skip
#
# 2. DUMP_DIR 必须 hard-code absolute 路径
#    engine adapter 的 env allowlist 只放 PATH/HOME/USER 等基础键和 CLAUDE_*/CODEX_*/NODE_*/NPM_CONFIG_*/XDG_*/LC_* 已知前缀
#    AIWORKER_*/DEBUG_*/DEBUG_ROOT 都不会传进 child（详见 docs/task/TODO-014.md）
#    用 ${DEBUG_ROOT:-/tmp}/dump 这种 fallback 会让 dump 落到 /tmp/dump，你以为 shim 没工作

set -u

# 真 claude 路径（如果不在标准位置可改这里）
REAL_CLAUDE="/home/ben/.npm-global/bin/claude"

# DUMP_DIR：每次 copy 这个 shim 到 $DEBUG_ROOT/bin/claude 后必须把 __DUMP_DIR__ 替换成 absolute 路径
DUMP_DIR="__DUMP_DIR__"

if [ "$DUMP_DIR" = "__DUMP_DIR__" ]; then
  echo "[claude-shim] ERROR: DUMP_DIR not initialized. Run 'sed -i s#__DUMP_DIR__#<absolute>#' before exec." >&2
  exit 78
fi

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
