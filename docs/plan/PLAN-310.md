# PLAN-310 Identity boundary

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 11:41
- **relatedTask**: FEAT-078

## Decision

Implement FEAT-078 from
`docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md`.

Host should own identity through a provider interface. The first implementation
is local bearer auth and must stay compatible with the existing daemon token
behavior. Soul Apps receive identity only through signed mount context and
broker scope, not through caller cookies, caller authorization headers or Host
private auth internals.

## Implementation Slices

1. PMA and Superpowers plan tracking.
2. Core auth provider interface and local bearer provider tests.
3. API middleware integration with request identity propagation.
4. Signed mount context and broker scope identity projection tests.
5. Documentation, focused verification, code-review-graph and commit.

## Verification Plan

- `bun run --filter '@zonease/aiworker-core' test src/host/identity-provider.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed. Core now exposes the Host auth provider contract and local bearer
implementation. The local daemon uses that provider for `/api/local/*`,
propagates authenticated operator identity to broker scope, and includes signed
identity plus broker grants in mounted Soul App context.

Verification passed with focused core/API tests and typechecks, lint, diff
check, and code-review-graph. CRG exited 0 with static test-gap hints for API
request helpers and mount context projection; coverage is provided by the
focused authenticated identity API test.
