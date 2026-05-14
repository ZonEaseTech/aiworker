# PLAN-312 Official Soul App broker proof closure

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 12:28
- **relatedTask**: FEAT-080

## Decision

Close the proof gap found by the zero-trust code audit: Host broker/search and
security review capabilities must be exercised by the official HR/QA Soul Apps,
not only by synthetic tests or documentation.

The boundary stays the same. Host owns permission checks, security review,
broker routes and shell lifecycle. Soul Apps own what descriptors to publish,
what search results mean, and their action/domain behavior.

## Investigation

- `packages/shared/src/soul-app/manifest.ts` accepts `search` in
  `requiredPermissions`.
- `apps/api/src/modes/worker.ts` parses descriptor `requiredPermissions` but
  omits `search` from its local permission-kind guard.
- `packages/core/src/soul-app/broker.ts` implements `broker.search.query()` and
  `broker.search.upsert()` behind manifest permissions.
- `apps/aiworker-hr/soul-app.manifest.json` and
  `apps/aiworker-qa/soul-app.manifest.json` do not declare search permissions.
- Existing API tests inject search permissions into a test manifest, proving the
  broker route but not the official app manifests.
- Worker Web Settings displays permission information but calls enable directly
  without treating `/security-review` `canEnable=false` as a lifecycle gate.

## Implementation Slices

1. PMA and Superpowers plan tracking.
2. API permission parser regression test and fix for `search`.
3. HR/QA manifest and mounted service tests proving broker search upsert/query.
4. HR/QA mounted implementation using SDK broker search helpers.
5. Worker Web security-review gate in Settings.
6. Documentation, validation, code-review-graph and conventional commit.

## Verification Plan

- Focused API test for descriptor `search` permission.
- Focused HR/QA package tests for action-published broker search descriptors.
- Focused Web test for security-review enable gate.
- CLI validate and smoke for HR/QA apps.
- Root `check`, `build`, `test`.
- `bun run crg:update` and `bun run crg:review`.

## Result

Completed on 2026-05-14.

The proof gap is closed through real official-app code paths. Host remains
generic and owns permission checks, broker routes, security review and shell
lifecycle. HR/QA own descriptor publication, mounted search result meaning and
domain behavior.

Verification passed:

- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run check`
- `bun run build`
- `bun run test`
- `bun run crg:update`
- `bun run crg:review`
