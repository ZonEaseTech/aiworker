# PLAN-315 npm preview release readiness

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 14:11
- **relatedTask**: FEAT-082

## Decision

Implement the 0.x public preview release gate defined in
`docs/superpowers/specs/2026-05-14-npm-preview-release-readiness-design.md`.

The package will carry official first-party Soul App release resources, while
Host continues to install and enable them through the normal manifest registry.
The release is not a 1.0 commitment and does not include Host auth.

## Implementation Slices

1. Add PMA and Superpowers implementation tracking.
2. Add runtime resource locators for Worker Web static and official Soul Apps.
3. Package official app resources into the CLI dist directory.
4. Add a dist/npm release smoke that matches the current Host/Soul App path.
5. Update preview release docs.
6. Run focused and root verification, close PMA, and review with CRG.

## Verification Plan

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `cd apps/cli/dist && npm pack --dry-run --json`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed on 2026-05-14.

- The CLI dist package now carries Worker Web static assets, DB migrations and
  first-party official HR/QA Soul App release resources.
- Source checkout and dist/npm runtime use explicit resource locators instead
  of relying on source repo paths in published packages.
- Dist release smoke verifies daemon startup, Host Web, app catalog,
  `app bootstrap official`, `app list`, `soul list` and HR template projection.
- Documentation marks the release as 0.x preview and keeps Host auth, 1.0
  claims and independent SDK/runtime npm publication out of scope.
- Verification passed with:
  - `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
  - `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
  - `bun run --filter '@zonease/aiworker-cli' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run --filter '@zonease/aiworker-cli' build:bundle`
  - `cd apps/cli/dist && npm pack --dry-run --json`
  - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
  - `bun run check`
  - `bun run test`
  - `bun run build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`

CRG exited 0 with static test-gap hints for helper/test functions; coverage was
verified through API/core/CLI focused tests, publish-manifest helper tests,
dist package dry-run and dist release smoke.
