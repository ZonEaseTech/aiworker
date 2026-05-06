# PLAN-140 Fleet-hosted Worker Admin brain bridge routes

- **status**: completed
- **createdAt**: 2026-05-06 14:19
- **approvedAt**: 2026-05-06 14:19
- **completedAt**: 2026-05-06 14:29
- **relatedTask**: BUG-082

## Context

Fleet-hosted Worker Admin is served from `/w/:workerId/` and rewrites worker
REST calls to `/w/:workerId/api/worker/*`. Gateway intentionally implements a
narrow HTTP bridge instead of a generic proxy. That bridge currently includes
`brain.test`, but not the Brain governance read/write routes that the Worker
Admin Brain page calls.

Relevant evidence:

1. `apps/web/src/worker/api.ts` calls `/api/worker/brain/summary`,
   `/api/worker/brain/admission*`, and `/api/worker/brain/artifacts*`.
2. `apps/api/src/worker/brain/routes.ts` serves those routes under worker
   bearer auth.
3. `packages/gateway/src/router/bridge.ts` rejects any unmapped path with
   `Unsupported worker bridge path ...`.
4. `FEAT-040` records that completed fleet-hosted Worker UI should cover
   Worker UI REST capabilities through same-origin gateway bridge.

## Proposal

1. Add explicit gateway proto methods for:
   - `brain.summary`
   - `brain.admission.list`
   - `brain.admission.show`
   - `brain.admission.approve`
   - `brain.admission.reject`
   - `brain.admission.apply`
   - `brain.artifacts.list`
   - `brain.artifacts.show`
2. Wire worker node dispatcher handlers for those methods.
3. Implement handlers in `aiworker serve` by reusing core Brain services and
   the same redaction/materialization rules as worker REST.
4. Extend gateway bridge allowlist with only those REST-compatible paths.
5. Add focused bridge and dispatcher tests.

## Scope

- `packages/gateway-proto`
- `packages/core` gateway dispatcher
- `apps/cli` serve node handlers
- `packages/gateway` bridge mapping and tests
- PMA tracking docs

## Non-Scope

- No generic worker HTTP proxy.
- No fleet.db storage for Brain proposals, artifacts, or payloads.
- No public Caddy/auth changes.
- No UI redesign.

## Risks

1. Brain admission apply is a write path; bridge must keep request body
   validation narrow and preserve the worker-side dry-run default.
2. Admission and artifact read paths can expose sensitive data when explicitly
   requested; worker-side redaction gates must remain authoritative.
3. Adding proto methods creates another transport surface, so method naming and
   workerId mismatch checks need regression coverage.

## Verification

- `bun test packages/gateway/test/worker-bridge.test.ts`
- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun run --filter '@zonease/aiworker-gateway-proto' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `git diff --check`

## Progress

- 2026-05-06 14:19: Root cause confirmed and plan approved by user.
- 2026-05-06 14:27: Implemented explicit Brain gateway proto methods, worker
  dispatcher handlers, CLI serve handlers, and gateway bridge route mappings.
- 2026-05-06 14:29: Focused bridge/dispatcher tests, package typechecks,
  repository lint, and diff whitespace check passed.
