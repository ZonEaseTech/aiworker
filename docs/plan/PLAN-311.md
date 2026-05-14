# PLAN-311 App-owned search index broker

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 11:47
- **relatedTask**: FEAT-079

## Decision

Implement FEAT-079 from
`docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md`.

Host should provide an app-scoped search index broker for non-authoritative
descriptors. Soul Apps own what to index and what results mean; Host only stores
and filters title, summary, reference and scope metadata after broker permission
checks.

## Implementation Slices

1. PMA and Superpowers plan tracking.
2. Shared `search` permission support.
3. Core in-memory app-scoped search index broker.
4. Local daemon and SDK broker search routes.
5. Documentation, focused verification, code-review-graph and commit.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
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

Completed. The shared manifest contract accepts `search` permissions, core adds
an app-scoped non-authoritative search index broker, the local daemon exposes
broker search upsert/query routes, and the Soul App SDK can use those routes.

Verification passed with focused shared/core/API/SDK tests and typechecks, lint,
diff check, and code-review-graph. CRG exited 0 with static test-gap hints for
API parsing/OpenAPI helpers and search-index helpers; coverage is provided by
the focused API broker search flow, core broker test and SDK route test.
