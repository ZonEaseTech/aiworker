# PLAN-337 Published official Soul App mounted entrypoint repair

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-16
- **approvedAt**: 2026-05-16
- **completedAt**: 2026-05-16
- **relatedTask**: BUG-123

## Current State

The published `@zonease/aiworker-cli@0.16.0` package bootstraps official HR/QA
Soul Apps from package-local `official-apps/`. Their manifests were patched by
`apps/cli/scripts/build-publish-manifest.ts` to use:

- `api.localService.command = ["bun", "dist/host-mounted.js"]`
- `modes.hostMounted.entry = "./dist/host-mounted.js"`
- `modes.standalone.entry = "./dist/standalone.js"`

However a clean Bun build of the official app packages emits:

- `dist/mounted/host-mounted.js`
- `dist/standalone/standalone.js`

The local published package therefore fails before HR/QA mounted action code can
run. Reproduction:

- `POST /api/local/apps/aiworker-hr/actions/create-people-profile` returns 502
  with `Module not found "dist/host-mounted.js"`.
- `POST /api/local/apps/aiworker-qa/actions/create-release-gate` returns the
  same 502.

The existing dist release smoke verified daemon startup, Host Web static assets,
official app bootstrap, app/soul lists and HR template discovery, but it did not
invoke a mounted Soul App action.

## Proposal

1. Update `patchOfficialAppManifest` to point official app manifests at the
   nested Bun output paths:
   - `dist/mounted/host-mounted.js`
   - `dist/standalone/standalone.js`
2. Strengthen `copyOfficialApp` tests with copied dist runtime files so the test
   verifies manifest paths and physical files together.
3. Filter stale legacy flat official app dist files so local ignored build
   leftovers cannot leak into release resources.
4. Add a dist smoke assertion that invokes:
   - HR `create-people-profile`
   - QA `create-release-gate`
   and checks the generic Host action response result is ok.
5. Run focused tests, bundle build, dist release smoke, diff check and CRG.

## Risks

- The source checkout may contain ignored stale flat dist files, so tests must
  avoid relying on current dirty build outputs and instead assert the copied
  runtime paths explicitly.
- The action smoke writes app-owned draft descriptors through Host brokers. It
  should run in an isolated temporary `AIWORKER_HOME`, which
  `smoke-dist-release.ts` already uses.
- This is a release packaging fix; changing runtime Host behavior would broaden
  scope unnecessarily.

## Scope

Expected files:

- `apps/cli/scripts/build-publish-manifest.ts`
- `apps/cli/scripts/build-publish-manifest.test.ts`
- `apps/cli/scripts/smoke-dist-release.ts`
- `docs/task/BUG-123.md`
- `docs/task/index.md`
- `docs/plan/PLAN-337.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

Planned focused verification:

- `bun test apps/cli/scripts/build-publish-manifest.test.ts`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

Results:

- RED: `bun test apps/cli/scripts/build-publish-manifest.test.ts` failed before
  the production patch because the manifest still emitted `dist/host-mounted.js`.
- RED: the focused test also failed when a stale flat `dist/host-mounted.js`
  fixture was copied into official app release resources.
- `bun test apps/cli/scripts/build-publish-manifest.test.ts` passed.
- `bun run --filter '@zonease/aiworker-cli' typecheck` passed.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` passed.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed and
  invoked HR/QA mounted primary actions successfully.
- `npm pack --dry-run --json` under `apps/cli/dist` reported no legacy flat
  official app runtime files and all four nested HR/QA mounted/standalone
  runtime files.
- `git diff --check` passed.
- `bun run crg:update` passed.
- `bun run crg:review` exited 0 with risk score `0.45`; static gaps were
  reviewed against the focused unit test and dist smoke evidence.
