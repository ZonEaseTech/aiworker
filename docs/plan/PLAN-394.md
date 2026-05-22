# PLAN-394 Internal Host broker permission kernel removal

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **relatedTask**: REFACTOR-086

## Current State

AIWorker has already removed the public `/broker/*` product API, SDK broker
client and mounted context broker hints. The remaining active dependency is
internal: `apps/api` still imports `createSoulAppBroker` and runs manifest
permission decisions before mounted action, search and surface calls. Core and
shared still ship the old broker and provider-registry modules to support that
path.

## Proposal

1. Update API tests so descriptor `requiredPermissions` metadata no longer
   blocks declared mounted action/search calls.
2. Remove API permission-decision helpers and call mounted action/search/surface
   routes based only on app existence, enabled status and declaration.
3. Delete `packages/core/src/soul-app/broker.ts`,
   `packages/core/src/soul-app/broker.test.ts` and
   `packages/core/src/soul-app/provider-registry.ts`, then remove core exports.
4. Delete shared broker provider schema/tests/exports if no live code consumes
   them after the core deletion.
5. Keep manifest `permissions` and descriptor `requiredPermissions` schemas as
   install-time metadata in this slice.

## Scope

- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `packages/core/src/index.ts`
- `packages/core/src/soul-app/broker.ts`
- `packages/core/src/soul-app/broker.test.ts`
- `packages/core/src/soul-app/provider-registry.ts`
- `packages/shared/src/soul-app/provider.ts`
- `packages/shared/src/soul-app/provider.test.ts`
- shared barrel exports

## Non-Goals

- Do not remove manifest `permissions` or `requiredPermissions` fields.
- Do not change Soul App manifest fixtures beyond what typecheck requires.
- Do not rewrite historical PMA, task, changelog or Superpowers audit records.
- Do not introduce a replacement Host authorization layer.

## Verification Plan

- API mounted action/search focused test and typecheck.
- Core test suite and typecheck after broker deletion.
- Shared test suite and typecheck after provider schema deletion.
- Docs contract, diff whitespace check and code-review-graph review.

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

## Completion Notes

The internal `createSoulAppBroker` kernel and provider registry have been
removed from active code. Host-mounted app behavior is now declaration-based:
installed and enabled apps can receive their declared action/search/surface
calls, while undeclared or disabled surfaces still fail at the Host boundary.

Shared manifest `permissions` and descriptor `requiredPermissions` stay in the
schema as app metadata for this slice. Historical PMA, changelog and
Superpowers records were not rewritten.
