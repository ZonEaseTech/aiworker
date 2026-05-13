# PLAN-306 Soul App broker permission hardening

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 01:16
- **relatedTask**: FEAT-074

## Decision

Close the next zero-trust gap after `PLAN-305`: Host action/search invocation
must validate descriptor-level broker permissions before contacting a mounted
Soul App service.

The contract is:

```text
manifest-declared descriptor -> broker permission decision -> mounted protocol call
```

Descriptor lookup and protocol forwarding remain Host-owned. Domain behavior and
result meaning remain Soul App-owned.

## Implementation Slices

1. PMA tracking and contract documentation.
2. Manifest validation for `requiredPermissions` grammar.
3. Host permission guard for shell action/search invocation.
4. HR/QA reference manifest permission declarations.
5. Focused tests, lint boundary, code-review-graph and conventional commit.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed. `requiredPermissions` now has a shared manifest schema and is
exported through the public shared Soul App contract. Host action/search
invocation checks descriptor permissions through the broker before forwarding to
mounted Soul App protocol routes.

HR and QA reference manifests now declare the minimum broker permissions for
primary actions, refresh/search/settings, and HR evidence drawer intent. Focused
API tests cover allowed invocation, denied invocation, and the key zero-trust
assertion that denied descriptor permissions do not reach the mounted service.

`crg:review` exited 0 with static private-helper test gaps. The affected helper
logic is covered by HTTP-level local daemon tests.
