# PLAN-329 CLI updater global package source detection

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-15 15:44
- **approvedAt**: 2026-05-15 15:44
- **completedAt**: 2026-05-15 17:20
- **relatedTask**: BUG-121

## Current State

`@zonease/aiworker-cli@0.15.1` is npm latest. A global Bun install exposes an
`aiworker` shim under `~/.bun/bin`, but the shim launches the bundled package
entrypoint under `~/.bun/install/global/node_modules/@zonease/aiworker-cli`.
The CLI updater currently looks for the global bin shim path, so real package
bundle execution can fall through to `source_unknown`.

The same shape can affect npm global installs because npm bin shims also launch
the package entrypoint under a global `lib/node_modules` package root.

## Proposal

Patch `detectInstallSource` so it treats these package roots as auto-upgradeable
package-manager installs:

- `/.bun/install/global/node_modules/@zonease/aiworker-cli` -> `bun-global`
- `/lib/node_modules/@zonease/aiworker-cli` -> `npm-global`

Add regression tests that use the real `aiworker-bun.js` package bundle path
instead of only testing global bin shim paths. Bump CLI to `0.15.2`, run local
release gates, publish a patch release, and verify the published package.

## Risks

- Over-broad `node_modules` detection could incorrectly classify local project
  dependencies as global installs. The fix avoids this by only matching Bun's
  global install root and npm's `lib/node_modules` global layout.
- Existing `0.15.0` / `0.15.1` installations cannot receive this fix through
  their broken updater path; affected users need one manual package-manager
  upgrade. The fix makes subsequent upgrades work.

## Scope

Expected changes:

- `apps/cli/src/updater.ts`
- `apps/cli/src/updater.test.ts`
- `apps/cli/package.json`
- `.github/workflows/lint.yml`
- `.github/workflows/release.yml`
- `docs/task/BUG-121.md`
- `docs/task/index.md`
- `docs/plan/PLAN-329.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

- RED: `bun test apps/cli/src/updater.test.ts` failed for npm global package
  bundle and Bun global package bundle paths; both returned `source_unknown`.
- GREEN: `bun test apps/cli/src/updater.test.ts` passed after updating
  `detectInstallSource`.
- `bun test apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts`
  passed with 66 tests.
- `bun run --filter '@zonease/aiworker-cli' typecheck` passed.
- `bun run --filter '@zonease/aiworker-web' build` passed to generate Worker
  Web static assets for a fresh worktree.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` passed after Worker
  Web static assets existed.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed.
- A temporary Bun global package root running `apps/cli/dist/aiworker-bun.js`
  returned `source.kind: bun-global` and `status: update_available` for
  `update --check --target 99.0.0`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.15.2`.
- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun run crg:update` passed.
- `bun run crg:review` passed with risk score `0.40`; CRG reported
  `detectInstallSource` as an untested symbol even though the focused
  regression tests above executed it directly.
- `NODE_OPTIONS=--max-old-space-size=1024 bun run typecheck` passed locally and
  reproduced the GitHub Actions memory fix path after CI exposed 256MB Node heap
  OOM failures on the self-hosted runner.
- Main lint workflow `25909992060` passed on commit `6c0dc357`.
- Release workflow `25909996552` passed on tag `v0.15.2` / commit
  `6c0dc357`, including Typecheck, Test, Bundle CLI, Publish to npm, binary
  packaging and GitHub Release attachment.
- `npm view @zonease/aiworker-cli version dist-tags --json` reports version
  `0.15.2` and `latest: 0.15.2`.
- `bunx @zonease/aiworker-cli@0.15.2 --version` reports
  `aiworker/0.15.2 darwin-arm64 node-v24.3.0`.
- `gh release view v0.15.2` reports a non-draft, non-prerelease release with 8
  uploaded assets: 4 platform tarballs and 4 `.sha256` files.
- Published-package smoke passed from an isolated temp HOME/AIWORKER_HOME:
  daemon `/health`, `/api/local/info` runtimeVersion `0.15.2`, Host Web static
  serving, official app bootstrap, app list, soul list and HR template list.
- Published Bun global install smoke passed: `aiworker update --check --target
  99.0.0` reports `source.kind: bun-global`, `source.canAutoUpgrade: true` and
  `status: update_available`.
- Temporary org runner group public-repository access was restored to
  `allows_public_repositories=false` after release verification.
