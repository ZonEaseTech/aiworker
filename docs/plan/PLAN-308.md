# PLAN-308 Soul App permission visibility and install review

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 02:05
- **relatedTask**: FEAT-076

## Decision

Implement FEAT-076 from
`docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md`.

Host should expose a generic app security review before enablement. The review
is a platform projection of manifest-declared permissions, connector needs and
descriptor `requiredPermissions`; it is not an app-specific approval model and
does not interpret app-owned domain data.

## Implementation Slices

1. PMA and Superpowers plan tracking.
2. Core security review projection for installed Soul Apps.
3. Local daemon review route and enable/disable response payloads.
4. Worker Web API helpers and Settings Soul Apps review UI.
5. Documentation, focused verification, code-review-graph and commit.

## Verification Plan

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed. The local daemon exposes `GET
/api/local/apps/{appId}/security-review` and returns the same Host-owned review
projection from enable/disable lifecycle mutations. Worker Web Settings renders
manifest permissions, connector status and descriptor permission summaries
before generic app enablement.

Verification passed with focused core/API/Web tests, focused typechecks, lint,
diff check, Worker Web build and code-review-graph. CRG exited 0 with static
test-gap hints for route/bootstrap/display helpers; coverage is provided by the
HTTP-level API test and Worker Studio Settings flow test.
