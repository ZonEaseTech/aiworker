# PLAN-307 Soul App storage broker provider and app-owned drafts

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 01:34
- **relatedTask**: FEAT-075

## Decision

Implement FEAT-075 from
`docs/superpowers/specs/2026-05-14-host-soul-final-convergence-roadmap-design.md`.

Storage remains Host-owned as a platform capability, but app-written values
remain Soul App-owned domain content. The local implementation keeps SQLite as
the default provider and adds a provider interface so future S3/GCP providers do
not change Soul App code.

## Implementation Slices

1. PMA tracking and active contract docs.
2. Core storage provider interface and default SQLite provider.
3. Host action scope forwarding into permission decisions and mount context.
4. HR/QA mounted create actions writing draft records through broker storage.
5. Worker Web scope payload separation.
6. Verification, PMA closeout, code-review-graph and commit.

## Verification Plan

- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed. Host/core now has a `SoulAppStorageProvider` interface with SQLite as
the default local provider. `createSoulAppBroker` keeps permission, scope and
audit decisions in Host, then delegates app storage reads/writes through the
provider.

Host action invocation now separates app-owned `input` from Host `scope`; the
scope is used for descriptor permission checks and is forwarded in signed mount
context. HR/QA mounted create actions use the public SDK broker client to write
app-owned draft records when Host context is present, while direct mounted
service calls without Host context keep the previous lightweight behavior.

Worker Web now sends worker/workspace/session scope separately from action
input. The implementation does not introduce S3/GCP/Logto dependencies and does
not make Host understand people profile or release gate fields.
