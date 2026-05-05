# TODO-013 LLM evaluator inflates per-prompt latency to 60-120s, exceeds default 90s timeout

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-04 22:10
- **discoveredAt**: 2026-05-04 21:46
- **plan**: TBD
- **relatesTo**: BUG-057 (LLM evaluator JSON schema), PLAN-104 (Decision pipeline)

## Observed Behavior

In 0.7.0 the LLM evaluator path actually works (intent classifier emits `source=intent-llm`, quality_gate uses a strict JSON schema system prompt; this is the BUG-057 fix). But the full path is sequential and slow:

Setting `orchestrator.decisionPipeline.intentClassifier.evaluator=llm` + `qualityGate.evaluator=llm`, then sending one short prompt:

```
我想知道 React 19 里面 useTransition 的新行为，请用一句话总结。
```

triggers ≥5 claude-code subprocess spawns (intent + capability + main + quality + retry) over a single user turn. Each spawn cold-starts the claude binary (~1-3s) plus model first-token (~3-5s). Total wall-clock easily exceeds the `aiworker run --timeout-ms 90000` default; observed run timed out before main response completed. Subsequent `orchestrator.finished` event never emitted.

## Why this matters

- Out of the box, enabling LLM evaluator fails for most prompts under default timeout
- Evaluator system prompts are large (the project brief alone is ~333 tokens, sent on every spawn). With cold cache between spawns, the entire system prompt is re-sent 4-5×, multiplying token cost
- Operators will be tempted to disable LLM evaluator, losing the recently-shipped 0.7.0 BUG-057 fix value

## Expected Behavior

A. **Parallelize independent decisions**: `intent_classifier` and `capability_classifier` are in principle independent; run concurrently rather than serial

B. **Reuse claude-code prompt cache**: pass `CLAUDE_CACHE` / equivalent so system prompt hash is reused across spawns within the same orchestrator run; or share a single long-lived claude process for the run

C. **Auto-extend timeout when LLM evaluator is enabled**: when `decisionPipeline.*.evaluator=llm` is set, default `--timeout-ms` to 240s and emit a one-line warn at run start

D. **Graceful degradation**: when quality_gate LLM call exceeds half of remaining timeout, skip to heuristic fallback rather than aborting

## Reproducer

```bash
DEBUG_ROOT=/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0
cd $DEBUG_ROOT/proj-developer

VER=$($DEBUG_ROOT/npm-prefix/bin/aiworker config show 2>&1 \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')

aiworker config set "$(cat $DEBUG_ROOT/run/llm-evaluator-config.json)" --if-match $VER

PATH="$DEBUG_ROOT/bin:$PATH" aiworker run \
  --message "用一句话总结 React 19 useTransition 新行为。" \
  --chat-id "qa:llm:$(date +%s)" --timeout-ms 90000 2>&1 \
  | grep -E '"orchestrator.intent_decision|orchestrator.quality_gate|finished|timed out'

# Expected: intent_decision (source=intent-llm) + capability_decision + main text + quality_gate + finished, all under 90s
# Actual: intent + capability emit but main times out before finished
```

## Validation

After fix, default `--timeout-ms` setup with LLM evaluator enabled completes one prompt to `orchestrator.finished` consistently (10/10 retries) under wall-clock 90s.

## Evidence

- `/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/findings/TODO-2-llm-evaluator-latency.md`
- `/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/run/phase6-output.log`
- `/home/ben/projects/debug-aiworker/qa-2026-05-04-v0.7.0/dump/claude-{1777932276..1777932364}-*.txt` (5 LLM spawn dumps)
