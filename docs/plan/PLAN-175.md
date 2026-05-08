# PLAN-175 Gate verdict result surface

- **status**: completed
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker has intent / capability / quality-gate decision events, but operator
experience is still decision-sample oriented. It does not yet expose a single
Gate verdict that explains whether one task result should pass, warn, repair,
rerun, switch executor, hold, or block.

Implemented 2026-05-09:

- Added a normalized `gateVerdict` section to every Brain Journal task trace.
- Verdict actions cover `pass`, `warn`, `repair`, `rerun`,
  `switch-executor`, `hold`, and `block`.
- Quality-gate payloads map to `heuristic` or `brain-engine-review` reasons
  with truthful `observe-only` / `enforced` mode.
- Executor failures without a quality gate map to an observe-only `rerun`
  suggestion.
- Admission bypass signals map to enforced `hold` with source
  `kernel-invariant`.
- The surface remains explanatory. It does not introduce a hidden permission
  broker or hard domain workflow engine.

## Goal

Create an operator-facing Gate verdict contract and result surface that separates
hard invariants from Brain Engine review and executor claims.

## Scope

- Define verdict actions: `pass`, `warn`, `repair`, `rerun`, `switch-executor`,
  `hold`, `block`.
- Define verdict reasons with source/mode:
  - `kernel-invariant`;
  - `brain-engine-review`;
  - `executor-claim`;
  - `human-approval`;
  - `heuristic`;
  - `observe-only`;
  - `enforced`.
- Gate must inspect hard signals such as scope, secret/PII, unsupported durable
  Brain writes, missing evidence, bypass claims, and authority mode warnings.
- Expose verdict in CLI/API/UI-friendly shape and attach it to Journal traces.

## Non-Goals

- No domain expert workflow rules.
- No hidden hard block based only on ambiguous LLM judgment.
- No full permission broker.

## Acceptance Criteria

1. Each task can expose one latest Gate verdict with action, reasons, source/mode,
   and evidence refs.
2. Hard invariant failures are distinguishable from Brain Engine suggestions.
3. Existing observe-only quality-gate behavior remains truthfully labeled.
4. Tests cover pass, warn, repair/rerun suggestion, hold, and block-shaped verdicts.

## Verification

- `bun test packages/core/src/worker/brain/journal/service.test.ts`
- `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-173, PLAN-174
- **blocks**: PLAN-177, PLAN-180
