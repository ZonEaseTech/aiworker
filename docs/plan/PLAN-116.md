# PLAN-116 Truthfulness contract for orchestrator decision events and brain status surface

- **status**: completed
- **createdAt**: 2026-05-05 23:55
- **approvedAt**: 2026-05-05 23:55
- **completedAt**: 2026-05-06 00:30
- **relatedTask**: BUG-066, BUG-067

## 现状

DOC-005 / PLAN-114 已经把 Brain 定位为 Governance Brain Kernel：hard logic owns
invariants, LLM owns semantics；decision events 必须如实标注 source / mode /
enforce 状态；不能把 heuristic + observe-only 包装成 "Brain decision LLM 已接管"。

QA-006 给出 0.8.0 的诚实差距：

- `DecisionMode` 在 `packages/core/src/worker/orchestrator/decisions.ts:5` 只有
  一个值 `'observe_only'`，`decisionBase()` line 172 hard-code，类型层面不可能
  emit `enforced`。
- `quality_gate` 已经有 `gateMode: observe|warn|retry|block` 与
  `evaluator: heuristic|llm|none`；当 `gateConfig.mode === 'retry'` 且
  `gate.action === 'repair'` 时 `service.ts:379` 会真的 retry 改写下游 — 这是
  真 enforced 路径，但顶层 `mode` 字段仍写 `observe_only`，自相矛盾。
- `intent-classifier.ts` 的 LLM path 已存在；fallback 用 `source: 'intent-fallback'`
  + `reason: llm-retry-exhausted: error.slice(0,120)`，但丢失 raw LLM output、
  templateId、完整 parse error、attempt 序号。
- `conversation.classifier` 事件 payload 仅 `{conversationId, decision:
  {continue, reason}}`；3 种 fallback 标签 `classifier-error-default-continue` /
  `malformed-response` / `non-json-classifier-output` 完全不带 source / mode /
  engine / model / templateId / rawOutput / parseError。
- `runBrainStatus()` / `/api/worker/info` brainSummary / `/api/worker/brain/summary`
  全都不报 decision pipeline 状态：operator 没办法在不抓事件流的情况下知道
  classifier evaluator 是 heuristic 还是 llm，更无法看到 fallback rate。

`docs/architecture.md` Decision events 行 (line 87) 已经写清 truthfulness
contract，文档合规、代码未达标。

## 方案

不做任何向后兼容（1.0.0 前不留 alias / shim）。按下面 7 块按依赖顺序落地：

### A. Decision type 真实化（`packages/core/src/worker/orchestrator/decisions.ts`）

- `DecisionMode` 扩展为 `'observe_only' | 'enforced'`；`decisionBase()` 接 `mode`
  参数，默认 `observe_only`。
- `IntentDecisionPayload` 新增 `evaluator: 'heuristic' | 'llm'` 字段（与 source
  配套，避免 consumer 二义解析多种 source 字符串）。
- `buildQualityGatePayload` 增加 mode 计算：当 `gateConfig.mode ∈ {retry, block}`
  且 `gate.action ∈ {repair, block}` 实际改写下游时 `mode='enforced'`，其他场景
  `observe_only`。
- `buildPromptCapabilityDecision` 顶层 `mode='observe_only'`，并保留 reason 字段
  `"capability registry advisory"`，明确这是 advisory。

### B. Intent classifier 诚实 fallback（`packages/core/src/worker/orchestrator/intent-classifier.ts`）

- LLM 与 fallback 路径都填 `evaluator`、`templateId='intent-classifier-v1'`、
  `attempt`（1 / 2）。
- fallback 时携带 `rawOutput?: string`（≤2048 字符截断 + secret redaction）、
  `parseError?: string`（完整 message）。
- happy path 不带 rawOutput / parseError，避免放大 SSE / log 体积。

### C. Conversation classifier payload 扩展（`packages/core/src/worker/conversation/router.ts` + `service.ts`）

- `ConversationDecision` 结构改成
  `{continue, reason, source: 'classifier-llm'|'classifier-fallback'|'classifier-disabled', evaluator: 'llm'|'heuristic'|'none', engine?, model?, templateId?, rawOutput?, parseError?, attempt?}`。
- `service.ts:610` emit `conversation.classifier` 时透传完整结构；happy path
  仅带 source / engine / model / templateId / attempt；fallback 时才带 rawOutput
  与 parseError。

### D. quality_gate enforced mode 真实标注（`service.ts` 与 `quality-gate.ts`）

- `evaluateQualityGate` 返回结构里继续保留 evaluator / gateMode（自身字段）；
  `service.ts:378` emit 之前根据 `gateConfig.mode` + `gate.action` 计算顶层
  `mode`：`'enforced'` 当且仅当 retry/block 真改写下游，`'observe_only'` 其余。

### E. Decision pipeline ring buffer + brain status / REST surface 暴露

- 在 worker runtime 进程内维护一个轻量 ring buffer：最近 50 个 intent / quality
  / conversation classifier 事件，按 evaluator + outcome 分桶统计；不入 worker.db。
- 扩展 `runBrainStatus()` 与 `buildBrainSummary()` 输出新增 `decisionPipeline`
  段：`intentClassifier` / `capabilityRouter` / `qualityGate` /
  `conversationClassifier` 各报 evaluator / mode / threshold / recent
  windowSize / samples / fallbackRate / lastFallbackReason。
- `/api/worker/info` 与 `/api/worker/brain/summary` 同步暴露；新增 `decisionPipeline`
  字段到 OpenAPI metadata。

### F. 配套测试

- `decisions.test.ts`：默认 `observe_only`；`buildQualityGatePayload` 在 retry +
  repair 切 `enforced`；intent payload 含 evaluator。
- `intent-classifier.test.ts`：heuristic / LLM-ok / LLM-retry-then-fallback 三
  态都写 templateId+attempt+evaluator；fallback 时 rawOutput / parseError 出现
  且被截断、被 redact。
- `conversation/router.test.ts`（新建）：3 种 fallback 都带 source +
  rawOutput + parseError；happy path 仅带元信息。
- `quality-gate.test.ts`：mode 字段在 retry/block 真发生时切 enforced。
- `decisions-buffer.test.ts`（新建）：ring buffer 50 事件后稳定、fallback rate
  计算正确、lastFallbackReason 跟随。
- `brain.ts` snapshot test 与 `apps/api/src/worker/brain/routes.test.ts`：含
  `decisionPipeline` 段。

### G. Docs / product copy 校对

- grep README、AGENTS.md、CLI help、Soul preset description、init next-steps、
  SOUL.md / AGENT.md template 中暗示 "Brain LLM 已接管" 的措辞；统一改成与
  `docs/architecture.md` Decision events 行一致：heuristic-default +
  observe-only-by-default + LLM 仅 opt-in。
- `aiworker-release-debug` skill 已经在 7adc00a 反哺过 always-on rule #4 的
  truthfulness 现状描述；本 PLAN 完成后只校对一致性，不重写 skill。

## 风险

1. **payload schema 扩展**：consumer（gateway / fleet UI / worker admin /
   evolution observer）若硬解析旧字段会因结构变化失败。**不做向后兼容**意味着
   evolution observer 与任何 consumer 都要在同一改动里同步。
2. **enforced 误判**：标 enforced 但下游没 gating 会让 operator 误以为已
   enforce。保守判定：仅当 quality gate retry/block 真改写下游时才 enforced，
   覆盖测试 PASS/repair/retry/block 四种 action × observe/warn/retry/block 四
   种 mode 的真值表关键格点。
3. **rawOutput 含敏感信息**：走现有 redaction 规则；2048 字符截断；rawOutput
   仅 fallback 时携带；fixture 加 sk-token 验证脱敏。
4. **ring buffer 进程重启清空**：文档说明 in-memory；不当 audit 用；如果未来
   需要持久化另起 PLAN。
5. **测试服已部署 0.8.0**：本 PLAN 不发版，只是源码改动；下一次发版（PLAN-119
   候选 0.9.0）时把所有 truthfulness 改动一起发。

## 范围

- `packages/core/src/worker/orchestrator/decisions.ts`
- `packages/core/src/worker/orchestrator/intent-classifier.ts`
- `packages/core/src/worker/orchestrator/quality-gate.ts`
- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/conversation/router.ts`
- `packages/core/src/worker/management/info.ts`（brainSummary 扩展）
- `packages/core/src/worker/management/decision-pipeline-stats.ts`（新建 ring buffer）
- `apps/cli/src/commands/worker/brain.ts`
- `apps/api/src/worker/brain/routes.ts`
- `apps/api/src/modes/worker.ts`（OpenAPI metadata）
- `packages/core/src/worker/evolution/observer.ts`（如需同步新字段）
- 上述对应 `*.test.ts`
- README / AGENTS.md / CLI help / SOUL/AGENT template 中的 truthfulness copy

## 非范围

- 不默认接管 LLM brain decision；intent / quality 默认仍 heuristic，capability
  仍 advisory registry。
- 不新增 capability LLM router。
- 不修 admission governance bridge（BUG-068 / BUG-074）。
- 不修 codex executor parity（BUG-069 / BUG-070）。
- 不新增 DB migration / worker.db schema 改动；recent stats 全 in-memory ring
  buffer。
- 不接 fleet UI / worker admin UI 显示 decisionPipeline 状态（UI 专项另起）。
- 不发版（CLI 0.9.0 由后续 release plan 收口）。

## 验证

```bash
# 聚焦改动 package
bun run --filter '@zonease/aiworker-core' typecheck
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-cli'  test
bun run --filter '@zonease/aiworker-api'  test

# 全仓 gate
bun run typecheck
bun run lint
bun run test
bun run check

# 端到端冒烟（隔离 prefix）
ROOT=/home/ben/projects/debug-aiworker/plan-116
mkdir -p "$ROOT" && cd "$ROOT"
bun run --filter '@zonease/aiworker-cli' build:bundle
# 装本地 build 的 CLI → init dev Soul + claude-code → 跑 3 turn → 校验事件流
grep -E '"mode":"(observe_only|enforced)"' samples/*.log
grep -E '"source":"intent-(heuristic|llm|fallback)"' samples/*.log
grep -E '"templateId":"intent-classifier-v1"' samples/*.log
aiworker brain status | python3 -c 'import json,sys; d=json.load(sys.stdin); assert "decisionPipeline" in d'
```

## 进度

- 2026-05-05 23:55：PLAN-116 立项；按 DOC-006 列出的 P1 Truthfulness layer 做 BUG-066+BUG-067 的实施切片。
- 2026-05-06 00:30：完成 7 块改动 + 全量 gate（typecheck / lint / test）通过。`bun run test` 9 workspace 共 1274 tests，0 fail；新增 5 个测试文件、扩展 2 个，覆盖 mode 真值表、ring buffer、conversation classifier 4 种 fallback、rawOutput 脱敏截断、REST `/summary` decisionPipeline 段。BUG-066 / BUG-067 同步 completed。
