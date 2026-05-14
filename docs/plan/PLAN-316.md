# PLAN-316 CLI 0.13.0 preview minor release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 15:35
- **relatedTask**: REL-032

## Decision

Publish `@zonease/aiworker-cli@0.13.0` as a 0.x preview minor release following
`docs/superpowers/specs/2026-05-14-cli-0-13-0-preview-release-design.md`.

The release proves the packaged Host Web/API plus bundled official HR/QA Soul
App runtime path. The CLI package carries official app runtime bundles; this
release does not publish standalone SDK/runtime npm packages and does not claim
third-party Soul App authoring outside the monorepo.

## Implementation Slices

1. Register `REL-032` / `PLAN-316` and start the changelog entry.
2. Bump `apps/cli/package.json` to `0.13.0`.
3. Run source/build/dist/pack/smoke release gates.
4. Commit release prep, push `main`, create and push annotated tag `v0.13.0`.
5. Monitor GitHub Actions release workflow.
6. Verify npm latest, `bunx`, GitHub Release assets and published-package smoke.
7. Close PMA/changelog evidence with residual risk notes and push validation docs.

## Verification Plan

Before tagging:

- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun apps/cli/dist/aiworker-bun.js --version`
- `bun pm pkg get version --cwd apps/cli/dist`
- `cd apps/cli/dist && npm pack --dry-run --json`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`

After tagging:

- GitHub Actions release workflow for `v0.13.0`
- `npm view @zonease/aiworker-cli version`
- `bunx @zonease/aiworker-cli@0.13.0 --version`
- `gh release view v0.13.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url`
- published-package smoke for Host Web/API plus official app bootstrap
- compact governance harness if it still matches the current preview product path

## Failure Handling

- If any local gate fails, do not tag or publish. Fix the blocker and rerun the
  full relevant gate.
- If the GitHub release workflow fails before npm publish, keep `REL-032`
  in-progress and retry with a clean tag strategy after diagnosis.
- If npm publishes `0.13.0` but post-release smoke fails, do not overwrite the
  version. Record the regression and prepare a `0.13.1` patch.

## Result

Completed on 2026-05-14.

- Published `@zonease/aiworker-cli@0.13.0` through annotated tag `v0.13.0`.
- Local source/build gates passed: `bun run check`, `bun run test`,
  `bun run build`, and `git diff --check`.
- Dist version checks reported `aiworker/0.13.0` and dist package version
  `"0.13.0"`.
- `npm pack --dry-run --json` from `apps/cli/dist` packed 114 files and included
  CLI shims, Worker Web static assets, worker migrations and official HR/QA
  bundled runtime resources.
- `smoke:dist-release` passed for the dist CLI Host Web/API and official app
  bootstrap path.
- GitHub Actions release run `25848244863` completed successfully, published npm
  and attached four GitHub Release binary tarballs.
- npm latest is `0.13.0`; explicit `bunx @zonease/aiworker-cli@0.13.0
  --version` reports `aiworker/0.13.0`.
- Published-package smoke passed with report at
  `/private/tmp/aiworker-release-0.13.0-published-smoke-ThktM4/report.json`.
- The legacy governance compact harness was consciously replaced because it
  targets retired worker-governance surfaces rather than this release's
  packaged Host/Soul App preview path.
