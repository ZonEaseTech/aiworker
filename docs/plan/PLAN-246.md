# PLAN-246 Worker Web shared layout validation

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 11:24
- **relatedTask**: QA-034

## Current State

The worker home and workspace routes look visually inconsistent because the
layout chrome is route-owned. The validation pass must prove that the shared
layout preserves behavior and fixes route-level geometry drift.

## Proposal

1. Run focused Worker Web automated gates after implementation.
2. Use Playwright MCP to inspect live 9217 routes:
   - worker home;
   - workspace route;
   - session route;
   - 390px mobile workspace/session layout.
3. Record CRG output and PMA closeout.

## Scope

In scope:

- Browser and automated validation for the shared layout refactor.
- PMA docs and changelog evidence.

Out of scope:

- Full release validation.
- Published package harnesses.

## Risks

- Local 9217 data may not include every state. Use the existing worker,
  workspace, and session data where available, and rely on RTL for no-worker
  state.

## Verification Plan

- Passed `bun run --filter '@zonease/aiworker-web' typecheck`.
- Passed `bun run --filter '@zonease/aiworker-web' lint`.
- Passed `bun run --filter '@zonease/aiworker-web' test -- worker-studio`.
- Passed `bun run --filter '@zonease/aiworker-web' test`.
- Passed `bun run --filter '@zonease/aiworker-web' build`.
- Passed `git diff --check`.
- Playwright MCP validated desktop worker/workspace/session and 390px
  workspace/session route comparison.
- Passed `bun run crg:update`.
- Passed `bun run crg:review`.

## Approval Gate

Approved by operator on 2026-05-11 after route layout inconsistency diagnosis.
