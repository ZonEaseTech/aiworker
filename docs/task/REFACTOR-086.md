# REFACTOR-086 Remove internal Host broker permission kernel

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21
- **claimedAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **plan**: PLAN-394
- **relatesTo**: HOST-001, PROTO-001, DATA-001, packages/core, apps/api, packages/shared

## Background

The public Host broker API and SDK client have been removed from the product
surface, but `apps/api` still imports `createSoulAppBroker` to enforce
descriptor `requiredPermissions` before mounted action, search and surface
calls. `packages/core` and `packages/shared` still carry the old broker
provider registry contract solely for that deprecated Host-owned kernel.

The active architecture says Host is a local shell, locator, mounter and engine
bridge. It should route only declared app-owned surfaces, then leave domain and
capability meaning inside the Soul App.

## Acceptance Criteria

1. Mounted workbench action, search and surface requests are allowed when the
   app is installed, enabled and declares the surface.
2. Host no longer uses `requiredPermissions` as a platform authorization gate.
3. `packages/core` no longer exports or ships `createSoulAppBroker`,
   broker tests or the provider registry.
4. Shared broker provider schemas and tests are removed if no live production
   code consumes them.
5. Manifest `requiredPermissions` remains valid metadata for this slice.
6. Focused API, core, shared, docs and CRG checks pass.

## Verification

- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run docs:check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Resolution

Removed the final active Host broker permission kernel:

- API mounted action/search/surface routing now checks only app existence,
  enabled status and declared descriptors before forwarding to the mounted Soul
  App.
- Descriptor `requiredPermissions` remains valid manifest metadata but no
  longer blocks Host routing.
- Deleted the core broker implementation, broker tests and provider registry.
- Deleted the shared broker provider schema/tests and removed public barrel
  exports.
- Updated Host developer guidance so it no longer points agents at deleted
  broker files.

Focused API, core and shared package verification passed. Code-review-graph
reported risk score `0.45`, no affected flows, and test-gap notes for the
touched API helpers; the API behavior is covered by the focused mounted
action/search test.
