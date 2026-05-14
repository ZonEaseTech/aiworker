# PLAN-320 Release daemon runtime version propagation

- **status**: completed
- **createdAt**: 2026-05-14
- **approvedAt**: 2026-05-14
- **completedAt**: 2026-05-14 18:02
- **owner**: codex
- **relatedTask**: BUG-120

## Context

`apps/api/src/modes/worker.ts` exposes `runtimeVersion` through `/health`,
`/api/local/info` and OpenAPI metadata. Its source-mode fallback is
`DEFAULT_RUNTIME_VERSION = 'dev'`.

`apps/cli/src/aiworker.ts` already reads `apps/cli/package.json` for
`aiworker --version`, but `daemonForeground()` calls `bootstrapWorkerApp()`
without passing that package version. As a result, a packaged daemon falls back
to `dev`, and Worker Web Settings shows `dev` in the About section because it
renders `data.info.runtimeVersion`.

## Proposal

1. Add a dist release smoke assertion that reads `apps/cli/dist/package.json`
   and verifies `/api/local/info.runtimeVersion` equals the dist package
   version.
2. Pass `runtimeVersion: packageJson.version` from the CLI daemon foreground
   path into `bootstrapWorkerApp()`.
3. Add focused CLI test coverage for the version contract where practical
   without broad process orchestration.
4. Record verification evidence and close BUG-120 / PLAN-320.

## Scope

In scope:

- CLI daemon bootstrap version injection.
- Dist release smoke coverage.
- Focused CLI/API verification and PMA bookkeeping.

Out of scope:

- Publishing another CLI package.
- Renaming `runtimeVersion`.
- Changing Settings UI copy or layout.
- Changing Soul App protocol, app manifests or broker behavior.

## Verification

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-14 17:58: Started after reproducing the release daemon returning
  `runtimeVersion: "dev"` despite CLI `--version` reporting `0.13.1`.
- 2026-05-14 18:02: Implementation completed with dist release smoke red/green
  coverage.

## Verification Results

- Red test: `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
  failed before the fix with `Expected daemon runtimeVersion 0.13.1, got dev`.
- `bun run --filter '@zonease/aiworker-cli' build:bundle`: passed, exit 0.
  HR, QA and CLI bundles were emitted.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`: passed,
  exit 0. The smoke started a dist daemon, checked `/health`,
  `/api/local/info`, Worker Web HTML/assets, `/api/local/apps`, official app
  bootstrap, Soul list and HR template projection.
- `bun run --filter '@zonease/aiworker-cli' test`: passed, exit 0.
  `21 pass`, `0 fail`, `127 expect() calls`.
- `bun run --filter '@zonease/aiworker-cli' typecheck`: passed, exit 0.
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`:
  passed, exit 0. `25 pass`, `0 fail`, `202 expect() calls`.
- `git diff --check`: passed, exit 0.
- `bun run crg:update`: passed, exit 0. Reported `18 files updated`, covering
  the mixed worktree.
- `bun run crg:review`: passed, exit 0. It analyzed the full mixed worktree and
  reported risk score `0.50` with test gaps on in-progress BUG-119-related
  changed functions such as `serveHostMounted` and `persistPeopleProfileDraft`;
  those files were outside BUG-120's implementation scope.
