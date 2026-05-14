# FEAT-082 npm preview release readiness

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 14:11
- **plan**: PLAN-315
- **relatesTo**: apps/cli, apps/api, packages/core, apps/aiworker-hr, apps/aiworker-qa, docs/deployment.md, docs/cli.md

## Context

AIWorker is preparing a 0.x public preview release for external npm users.
The package should support `bunx` / `npx @zonease/aiworker-cli` as the entry,
without requiring a monorepo checkout for Host Web/API startup or official
HR/QA Soul App bootstrap.

Current source-checkout validation passes for official app bootstrap,
validate and smoke. The built dist package starts `/health`, but it does not
serve Worker Web from package-local static assets and cannot locate official
Soul App manifests inside the package.

## Goals

- Make the CLI package self-contained for local daemon runtime resources.
- Serve Worker Web from the npm package in dist mode.
- Bootstrap official HR/QA Soul Apps from package-local release resources.
- Replace stale release smoke coverage with a current Host/Soul App product
  path smoke.
- Mark the npm release as 0.x preview and keep Host auth out of this gate.

## Non-Goals

- No 1.0 release claim.
- No Host auth implementation.
- No third-party Soul App SDK/runtime npm publication.
- No remote gateway, fleet, marketplace or cloud provider scope.
- No Host interpretation of HR/QA domain data.

## Acceptance Criteria

- `apps/cli/dist/aiworker.js daemon foreground` serves `/`, `/health`,
  Worker Web assets and `/api/local/apps` from a fresh temp home.
- `apps/cli/dist/aiworker.js app bootstrap official` succeeds without source
  repo `apps/aiworker-*` paths.
- `apps/cli/dist/aiworker.js app list`, `soul list`, and
  `template list --soul aiworker-hr` show app-projected catalog data.
- `cd apps/cli/dist && npm pack --dry-run --json` includes `official-apps/`,
  `web/`, `drizzle/`, `aiworker.js`, and `aiworker-bun.js`.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passes.
- Docs describe this as a 0.x preview and identify preview/non-goal surfaces.

## Verification

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
- Verification passed with focused package tests, dist packaging checks, root
  gates and code-review-graph.
