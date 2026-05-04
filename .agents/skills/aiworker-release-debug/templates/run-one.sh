#!/usr/bin/env bash
# 业务采样 helper —— 跑 aiworker run 并提取 final text + 三个决策事件
#
# 用法：
#   ./run-one.sh <project-dir> <label> <message>
#   $SAMPLES 默认在 $DEBUG_ROOT/samples/
#
# 输出：
#   $SAMPLES/<label>.log  原始 stream（保留所有事件，便于事后再分析）
#   $SAMPLES/<label>.txt  final text + intent / capability / quality 关键字段
#
# 依赖：
#   - aiworker / bun 已在 PATH 内
#   - python3
#   - 可选：fake-claude shim 在 $DEBUG_ROOT/bin/claude 且 PATH 已前置（让 dump/ 同时落盘）

set -euo pipefail
PROJ="$1"; LABEL="$2"; MSG="$3"
DEBUG_ROOT="${DEBUG_ROOT:-/home/ben/projects/debug-aiworker/qa-$(date +%Y-%m-%d)}"
SAMPLES="${SAMPLES:-$DEBUG_ROOT/samples}"
mkdir -p "$SAMPLES"
cd "$PROJ"
echo "=== $LABEL ($PROJ) ==="
aiworker run --message "$MSG" --timeout-ms 120000 2>&1 \
  | tee "$SAMPLES/$LABEL.log" \
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
print("--- capability ---")
if capdec:
    keys = ("availableBuiltinCount","availableMcpToolCount","availableSkillCount",
            "availableToolsets","selectedBuiltins","selectedSkills","selectedMcpTools","reason")
    print(json.dumps({k: capdec[k] for k in keys if k in capdec}, ensure_ascii=False))
print("--- quality ---")
if quality:
    keys = ("action","score","reason","gateMode","evaluator","threshold","missing","suggestions",
            "status","dimensions","finalAnswerLength")
    print(json.dumps({k: quality[k] for k in keys if k in quality}, ensure_ascii=False))
' | tee "$SAMPLES/$LABEL.txt"
