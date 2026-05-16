# PLAN-338 CLI 0.16.1 patch release

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-16
- **approvedAt**: 2026-05-16
- **completedAt**:
- **relatedTask**: REL-038

## Current State

`@zonease/aiworker-cli@0.16.0` is the current npm latest and GitHub latest
release, but its official HR/QA Soul App manifests point Host mounted services
at a flat `dist/host-mounted.js` path that is absent from the published app
resources. `BUG-123 / PLAN-337` repaired the publish-manifest path and extended
dist release smoke coverage to invoke HR/QA mounted actions.

## Proposal

Publish `@zonease/aiworker-cli@0.16.1` as a patch release for the official Soul
App mounted entrypoint repair.

Execution steps:

1. Bump `apps/cli/package.json` from `0.16.0` to `0.16.1`.
2. Set `REL-038` / `PLAN-338` to implementation state and add release tracking.
3. Run local release gates:
   - `bun run check`
   - `bun run test`
   - `bun run build`
   - `git diff --check`
   - `bun apps/cli/dist/aiworker-bun.js --version`
   - `bun pm pkg get version --cwd apps/cli/dist`
   - `cd apps/cli/dist && npm pack --dry-run --json`
   - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
4. Run code-review-graph over the release diff.
5. Commit the release prep diff with a conventional release commit.
6. Push `main`, create and push annotated tag `v0.16.1`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.16.1 --version`
   - `gh release view v0.16.1 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app mounted action smoke.
9. Close `REL-038`, `PLAN-338`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- The bug only appears in clean published packages; local ignored `dist/` files
  may mask it. Release gates must rebuild from source and validate copied
  official app resources.
- If GitHub Actions release workflow fails before npm publish, keep the release
  task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.16.1` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.

## Scope

Expected repository changes during the release step:

- `apps/cli/package.json`
- `apps/cli/scripts/build-publish-manifest.ts`
- `apps/cli/scripts/build-publish-manifest.test.ts`
- `apps/cli/scripts/smoke-dist-release.ts`
- `docs/task/BUG-123.md`
- `docs/task/REL-038.md`
- `docs/task/index.md`
- `docs/plan/PLAN-337.md`
- `docs/plan/PLAN-338.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional Host/Soul App feature behavior should change during release prep
beyond the BUG-123 source fix and the version bump.

## Annotations

- 2026-05-16：开始 `0.16.1` patch release prep。
- 2026-05-16：本地 release gates 通过；`npm pack --dry-run --json`
  确认 package id 为 `@zonease/aiworker-cli@0.16.1`、entryCount 为 128、
  official app release resources 不再包含 legacy flat runtime files，并包含
  HR/QA 四个 nested mounted/standalone runtime files。

## Verification

- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun apps/cli/dist/aiworker-bun.js --version` reported
  `aiworker/0.16.1 darwin-arm64 node-v24.3.0`.
- `bun pm pkg get version --cwd apps/cli/dist` reported `0.16.1`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.16.1` with 128 entries, no legacy flat official app
  runtime files, and all four nested HR/QA mounted/standalone runtime files.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed and
  invoked HR `create-people-profile` plus QA `create-release-gate`.
- `bun run crg:update` passed.
- `bun run crg:review` exited 0 with risk score `0.45`; static gaps were
  reviewed against focused unit tests and mounted action smoke evidence.
