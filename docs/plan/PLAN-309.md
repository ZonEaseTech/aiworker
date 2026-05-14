# PLAN-309 Broker provider registry

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 11:33
- **relatedTask**: FEAT-077

## Decision

Implement FEAT-077 from
`docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md`.

Host should expose a typed, app-scoped broker provider registry that names the
platform providers behind storage, connectors, audit and secret references. The
registry is metadata only: it must not initialize future cloud SDKs, expose raw
secrets, or let Host interpret app-owned domain data.

## Implementation Slices

1. PMA and Superpowers plan tracking.
2. Shared provider registry schema/type.
3. Core provider registry projection and broker integration.
4. Local daemon route/OpenAPI plus SDK client helper.
5. Documentation, focused verification, code-review-graph and commit.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/provider.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed. The shared contract now defines provider registry schema/types, core
projects storage/connector/audit/secret-reference providers, the local daemon
exposes `/api/local/apps/{appId}/broker/providers`, and the Soul App SDK has
`client.broker.providers.list()`.

Verification passed with focused shared/core/API/SDK tests and typechecks, lint,
diff check, and code-review-graph. CRG exited 0 with static test-gap hints for
API bootstrap/route registration and broker projection helpers; coverage is
provided by the focused API broker route test and core provider registry test.
