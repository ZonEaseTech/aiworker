# PLAN-179 Authority mode and high-risk preflight

- **status**: completed
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker documentation is clear that executor-native capabilities and ambient
host authority are not AIWorker-owned. The product surface still needs a direct
operator-visible authority mode so users do not mistake Brain governance for a
permission boundary.

Implemented 2026-05-09:

- Added authority preflight classification for ambient / provider-managed /
  AIWorker-brokered / unknown modes.
- Added high-risk signals for production, database, destructive mutation,
  payment, PII, secrets, and cross-scope tasks.
- Orchestrator writes `authority.preflight` Journal events before executor
  dispatch; Journal trace and Gate verdict can cite those warnings.
- `aiworker run` prints current authority/risk so CLI users see the boundary
  before the task starts.
- Ambient high-risk tasks stay observe-only with `enforceable=false`; no false
  sandbox or broker promise is made.

## Goal

Expose authority mode and high-risk preflight truthfully: AIWorker governs Brain
and AIWorker-brokered capabilities, but not unmanaged ambient executor authority.

## Scope

- Define authority modes:
  - `ambient`: executor may use user/host-level tools, tokens, plugins, MCP, or shell;
  - `aiworker-brokered`: action must go through an AIWorker-controlled capability;
  - `read-only`;
  - `plan-only`;
  - `dry-run`.
- Surface current mode in CLI/API/UI where tasks are run or reviewed.
- Add high-risk preflight signals for prod/db/delete/payment/PII/secret/cross-scope
  intent.
- For ambient high-risk tasks, warn truthfully and recommend plan-only/dry-run/hold.
- Keep full broker implementation out of 1.0 unless a narrow capability is explicitly
  approved later.

## Non-Goals

- No full sandbox.
- No MCP firewall.
- No cloud permission broker.
- No promise to block executor actions that bypass AIWorker.

## Acceptance Criteria

1. Operator can see whether a task is using ambient or AIWorker-brokered authority.
2. High-risk ambient tasks produce a clear warning without claiming enforcement.
3. Gate verdict can reference authority mode as a reason.
4. Docs explicitly preserve the no-false-security boundary.

## Verification

- `bun test packages/core/src/worker/brain/authority/service.test.ts`
- `bun test packages/core/src/worker/brain/journal/service.test.ts`
- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test apps/cli/src/commands/worker/run.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-173
- **blocks**: PLAN-175, PLAN-180, PLAN-181
