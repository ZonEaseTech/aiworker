# REFACTOR-014 Rename internal CLI operator module away from `aim`

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-02 01:52
- **completedAt**: 2026-05-02 02:00

## Current Scope

BUG-010 / PLAN-058 cleaned current user-visible CLI naming and state filenames, but deliberately left `apps/cli/src/aim/` as an internal implementation detail. That was acceptable for the bug fix, but it still leaves source-level `aim` matches in import paths and internal symbols.

This refactor should finish the internal naming cleanup without changing the public CLI command tree or runtime behavior.

## Description

Rename the operator-side CLI implementation module from `aim` to `operator` and update internal names accordingly. The goal is to make `aiworker` the only current product name in source-facing operator CLI code while keeping historical PMA/changelog records intact.

Recommended target:

- `apps/cli/src/aim/` -> `apps/cli/src/operator/`
- `AimState` -> `OperatorState`
- `loadAimState` / `saveAimState` / `patchAimState` -> `loadOperatorState` / `saveOperatorState` / `patchOperatorState`
- `AimClient` / `createAimClient` / `AimWsError` -> `OperatorClient` / `createOperatorClient` / `OperatorWsError`

## Acceptance Criteria

1. `apps/cli/src/aim/` no longer exists; imports use `apps/cli/src/operator/`.
2. Current source and smoke scripts under `apps/cli/src` and `apps/cli/scripts` no longer contain word-boundary `aim` or `aiw`, except if a remaining occurrence is explicitly justified as historical in a test fixture.
3. User-visible CLI command names and output remain unchanged from BUG-010 / PLAN-058.
4. `aiworker gateway start` still writes operator state to `~/.aiworker/aiworker.json` and daemon files to `aiworker-gateway.pid` / `aiworker-gateway.log`.
5. Current docs touched by BUG-010 / PLAN-058 are updated if they mention `apps/cli/src/aim/` as a retained internal path.
6. CLI tests and typecheck pass.

## Out of Scope

- Renaming public commands, protocol roles, gateway package names, or `@zonease/aiworker-gateway-proto`.
- Editing historical PMA plan/task/changelog entries that record old paths from earlier implementation history.
- Changing operator state file format or adding legacy migration support.

## ActiveForm

Rename internal CLI operator module from aim to operator

## Dependencies

- **blocked by**: BUG-010 / PLAN-058
- **blocks**: (none)

## Notes

- This is intentionally a separate refactor from BUG-010 so the bug remains about user-visible naming, while this task handles internal source hygiene.
- Use `git mv` or equivalent file moves so review can preserve history where possible.
- 2026-05-02 02:00: Implemented via `git mv apps/cli/src/aim apps/cli/src/operator`, renamed internal operator state/client/session symbols, and kept public CLI behavior and filenames unchanged.
- Verification passed: `bun run --filter '@zonease/aiworker-cli' test`, `bun run --filter '@zonease/aiworker-cli' typecheck`, `rg -n "\\baim\\b|\\baiw\\b|aim\\.json|aim-gateway|src/aim" apps/cli/src apps/cli/scripts`, `git diff --check`.
