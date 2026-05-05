#!/usr/bin/env bash
# Multi-turn 稳定性 driver：在同一 chat-id 下跑 N 轮 prompt，验证：
#   1. 每轮 stdin 是否都重新注入完整 brain（不应该出现 --resume 让 brain 漂到 engine 自己的 session）
#   2. turn N 是否能引用 turn 1..N-1 的 context（conversation history 拼接正确）
#   3. stdin 体积是否随轮数线性增长（说明 history 拼上去了；如果 turn N 比 turn N-1 还小 → 拼接断了）
#
# 用法：
#   ./run-multi-turn.sh <project-dir> <session-label> <turns-file>
#   turns-file 每行一条 prompt（共 N 行）
#
# 输出：
#   $SAMPLES/<session-label>-turn-<i>.{log,txt}  每轮 final text + 决策事件
#   $DUMP_DIR/claude-*.txt                       fake-claude shim 抓的 stdin（事后按时间顺序排）
#
# 调用前必须：
#   - fake-claude/codex shim 已装且 PATH 前置（这个 driver 不抓 stdin，依赖 shim）
#   - $SAMPLES、$DUMP_DIR 已设或 $DEBUG_ROOT 已设

set -euo pipefail
PROJ="$1"; LABEL="$2"; TURNS="$3"
DEBUG_ROOT="${DEBUG_ROOT:-/home/ben/projects/debug-aiworker/qa-$(date +%Y-%m-%d)}"
SAMPLES="${SAMPLES:-$DEBUG_ROOT/samples}"
mkdir -p "$SAMPLES"
cd "$PROJ"

CHAT_ID="multiturn:$LABEL:$(date +%s)"
echo "[multi-turn] chat-id=$CHAT_ID project=$PROJ"

i=0
while IFS= read -r MSG; do
  [ -z "$MSG" ] && continue
  i=$((i+1))
  OUT="$SAMPLES/$LABEL-turn-$i"
  echo "=== turn $i: $MSG ==="
  aiworker run --message "$MSG" --chat-id "$CHAT_ID" --timeout-ms 240000 2>&1 \
    | tee "$OUT.log" \
    | python3 -c '
import json, sys
parts = []
intent = capdec = quality = None
for line in sys.stdin:
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        evt = json.loads(line)
    except Exception:
        continue
    t = evt.get("type")
    p = evt.get("payload", {})
    if t == "orchestrator.text":
        parts.append(p.get("delta", ""))
    elif t == "orchestrator.intent_decision":
        intent = p
    elif t == "orchestrator.capability_decision":
        capdec = p
    elif t == "orchestrator.quality_gate":
        quality = p
text = "".join(parts)
print("--- final text ---")
print(text)
print("--- intent ---")
if intent:
    keys = ("intent","mode","engine","model","risk","reason","sessionAction","confidence","source")
    print(json.dumps({k: intent[k] for k in keys if k in intent}, ensure_ascii=False))
print("--- quality ---")
if quality:
    keys = ("action","score","reason","gateMode","evaluator","threshold","status")
    print(json.dumps({k: quality[k] for k in keys if k in quality}, ensure_ascii=False))
' | tee "$OUT.txt"
done < "$TURNS"

echo "[multi-turn] done. $i turns. inspect $SAMPLES/$LABEL-turn-*.txt"
echo "[multi-turn] stdin size by turn (expect linear growth):"
ls -la "${DUMP_DIR:-$DEBUG_ROOT/dump}"/claude-*.txt 2>/dev/null | tail -"$i" | awk '{print $5, $NF}'
