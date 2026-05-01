# PLAN-060 Rename CLI operator module away from aim

- **status**: completed
- **createdAt**: 2026-05-02 01:52
- **approvedAt**: 2026-05-02 01:57
- **completedAt**: 2026-05-02 02:00
- **relatedTask**: REFACTOR-014

## Current State

BUG-010 / PLAN-058 completed the user-visible cleanup:

1. Runtime prefixes now use `[aiworker ...]`.
2. OTP approval instructions use `aiworker enroll approve <otp>`.
3. Operator state and daemon files now use `aiworker.json` and `aiworker-gateway.*`.

The remaining `aim` occurrences in current source are internal implementation paths and import names, mainly:

1. `apps/cli/src/aim/**`
2. imports from `./aim/commands/*` in `apps/cli/src/aiworker.ts`
3. `createAimClient` usage in `apps/cli/scripts/smoke-aiworker-fleet.ts`

## Proposal

1. Rename the internal module directory:
   - `apps/cli/src/aim/` -> `apps/cli/src/operator/`
2. Update import paths and test paths:
   - `./aim/...` -> `./operator/...`
   - `../src/aim/...` -> `../src/operator/...`
3. Rename internal symbols where they are part of the operator module API:
   - `AimState` -> `OperatorState`
   - `loadAimState` / `saveAimState` / `patchAimState` -> `loadOperatorState` / `saveOperatorState` / `patchOperatorState`
   - `AimClient` / `createAimClient` / `AimWsError` -> `OperatorClient` / `createOperatorClient` / `OperatorWsError`
4. Update current PMA/docs references created by BUG-010 / PLAN-058 if they mention `apps/cli/src/aim/` as the retained internal path.
5. Keep public CLI commands, protocol method names, role names, and user-facing docs unchanged unless they directly reference the internal path.

## Risks

1. **Mechanical churn**: many imports and tests move at once. Keep the diff mechanical and avoid behavior edits.
2. **Mock path regressions**: Bun `mock.module()` paths and relative imports can break after the move. Run the full CLI package test gate.
3. **Over-renaming protocol concepts**: do not rename `operator` wire roles, gateway package names, or protocol method names just because they sit near operator CLI code.
4. **Historical doc churn**: old plans/tasks may mention `apps/cli/src/aim/`; leave historical records alone unless they are current BUG-010/PLAN-058 status notes.

## Scope

In scope:

- `apps/cli/src/operator/**` file moves and internal symbol renames.
- CLI imports, scripts, and tests that reference the moved module.
- Current PMA status notes directly made stale by this refactor.

Out of scope:

- Gateway protocol changes.
- Public command tree changes.
- State file migration or compatibility layer.
- Historical PMA/changelog rewrites.

## Verification Plan

1. `bun run --filter '@zonease/aiworker-cli' test`
2. `bun run --filter '@zonease/aiworker-cli' typecheck`
3. `rg -n "\\baim\\b|\\baiw\\b|aim\\.json|aim-gateway|src/aim" apps/cli/src apps/cli/scripts`
4. `git diff --check`

## Alternatives

1. Keep `apps/cli/src/aim/` as internal history. Rejected for this task: it keeps grep noise and slows future naming cleanup.
2. Rename only the directory but not symbols. Simpler, but leaves `AimState` / `AimClient` in current source.
3. Rename the entire operator protocol surface. Too broad and semantically wrong; the protocol role is already `operator`, and gateway package names are unrelated to this cleanup.

## Notes

- 2026-05-02 01:52: Created after BUG-010 completion; implementation waits for explicit approval.
- 2026-05-02 01:57: Approved; implementation started.
- 2026-05-02 02:00: Completed. The CLI operator implementation now lives under `apps/cli/src/operator/`, internal `Aim*` state/client/session names are now `Operator*`, and current CLI source/smoke grep has no word-boundary `aim` / `aiw` or old state/daemon filenames.
- Verification passed: `bun run --filter '@zonease/aiworker-cli' test`, `bun run --filter '@zonease/aiworker-cli' typecheck`, `rg -n "\\baim\\b|\\baiw\\b|aim\\.json|aim-gateway|src/aim" apps/cli/src apps/cli/scripts`, `git diff --check`.
