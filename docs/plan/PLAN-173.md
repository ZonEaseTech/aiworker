# PLAN-173 Developer repo worker proof-loop contract and audit

- **status**: completed
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker already has Project Brain filesystem layout, executor adapters, worker
conversations, admission MVP, native skill projection, governance harness, and
Worker/Fleet surfaces. What is missing is a single 1.0 proof-loop contract that
ties these pieces into one operator-visible workflow.

2026-05-09 audit result:

- Current conforming surfaces: project-scope Brain filesystem, worker-owned
  `worker.db`, task/conversation/message persistence, decision pipeline samples,
  quality gate events, Brain admission MVP, admission bypass detector, executor
  event normalization, Worker REST, gateway bridge, and CLI command tree.
- Missing surfaces were mapped to PLAN-174..181. This session implemented
  PLAN-174 and PLAN-175 first because they make the existing loop inspectable
  without broadening AIWorker into executor isolation or a workflow engine.
- 1.0 remains developer-repo-first. HR / finance / legal / ops are still future
  Soul/scope models after the proof loop is validated on aiworker itself.

## Goal

Define the developer repo worker proof-loop contract before adding new runtime
behavior. This plan should map current implementation to the 1.0 loop and make
gaps explicit.

## Scope

- Audit existing `run`, `serve`, orchestrator, brain status, admission, events,
  and Worker Admin surfaces against the `GOALS.md` proof loop.
- Define the canonical proof-loop trace:
  init scope → select executor → run task → journal → gate → repair/rerun or pass
  → lesson candidate → admission.
- Define user-facing vocabulary for Journal, Gate, Brain Engine, Brain Inbox,
  authority mode, and proof-loop status.
- Produce follow-up issue notes only when a gap belongs outside PLAN-174..181.

## Non-Goals

- No runtime implementation.
- No new database schema.
- No UI redesign.

## Acceptance Criteria

1. A short architecture/plan note identifies current conforming surfaces and
   missing surfaces for PLAN-174..181.
2. The proof-loop state model and operator vocabulary are explicit enough for
   later implementation plans to share.
3. The plan confirms that 1.0 remains developer-repo-first and does not expand
   into HR / finance / legal product surfaces.

## Verification

- `bun test packages/core/src/worker/brain/journal/service.test.ts`
- `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- `bun test packages/storage-sqlite/src/worker/index.test.ts`
- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-gateway-proto' typecheck`
- `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`

## Dependencies

- **blocks**: PLAN-174, PLAN-175, PLAN-176, PLAN-177, PLAN-178, PLAN-179, PLAN-180, PLAN-181
- **relatesTo**: GOALS.md, docs/architecture.md, docs/governance-node-status.md
