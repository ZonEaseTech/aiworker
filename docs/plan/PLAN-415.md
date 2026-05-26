# PLAN-415 Real E2E round4 residual repair

- **status**: completed
- **createdAt**: 2026-05-25
- **approvedAt**: 2026-05-25
- **completedAt**: 2026-05-25
- **relatedTask**: BUG-158
- **superpowersSpec**: docs/superpowers/specs/2026-05-25-real-e2e-round4-residual-repair-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-25-real-e2e-round4-residual-repair.md

## Context

This plan implements only the current-HEAD residuals from `tmp/real-e2e-audit-2026-05-25-round4/`. BUG-157 / PLAN-414 already closed the earlier P2/P3 repair batch and must not be duplicated.

## Proposal

1. [x] Share session engine metadata helpers in core.
2. [x] Make CLI/API session creation use Host selected engine and freeze it on the session.
3. [x] Keep follow-up turns on the session engine, not the latest Host preference.
4. [x] Align mounted theme URL/data/rendering for HR and QA.
5. [x] Cancel stale universal workbench pollers when locator context changes.
6. [x] Add Host current date to invocation prompts.
7. [x] Verify focused tests, UI governance, mounted client rebuilds, and browser evidence.

## Verification

- [x] `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts`
- [x] `bun run --filter '@zonease/aiworker-core' typecheck`
- [x] `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts --test-name-pattern "freezes selected engine settings"`
- [x] `bun run --filter '@zonease/aiworker-api' typecheck`
- [x] `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts --test-name-pattern "freezes CLI engine choice"`
- [x] `bun run --filter '@zonease/aiworker-cli' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx --testNamePattern "resolved dark Host theme"`
- [x] `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx -t "updates mounted route theme data"`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' build`
- [x] `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- [x] `bun run --filter '@zonease/aiworker-soul-app-runtime' test src/index.test.ts --test-name-pattern "dark universal workbench theme"`
- [x] `bun run --filter '@zonease/aiworker-soul-app-workbench' test src/universal-workbench/client-entry.events.test.ts`
- [x] `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
- [x] `bun test apps/aiworker-hr/product/web/people-workbench/api.test.ts`
- [x] `bun run --filter '@zonease/aiworker-hr' typecheck`
- [x] `bun run --filter '@zonease/aiworker-hr' build:client`
- [x] `bun run --filter '@zonease/aiworker-hr' build:styles`
- [x] `bun run --filter '@zonease/aiworker-qa' build:client`
- [x] `bun run --filter '@zonease/aiworker-qa' build:styles`
- [x] `bun run ui:check`
- [x] Browser evidence under `tmp/real-e2e-round4-residual-repair-2026-05-25/`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review` — risk 0.60; CRG reported static test gaps for helper/test fixture symbols, while focused Core/API/CLI/Web/workbench regression tests cover the changed behavior.
