# PLAN-235 Worker-first Web information architecture

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **approvedAt**: 2026-05-11 01:11
- **relatedTask**: REFACTOR-058

## Current State

- The Web shell design is approved and should continue.
- Home still renders a Soul rail and derives the active worker from Soul.
- Routes omit worker id and start at workspace/session.

## Proposal

1. Change routes to worker-first paths.
2. Render home as worker list plus create worker, using the current card/rail
   design language.
3. Render worker detail as the place for worker identity, bound Soul/domain,
   capability templates, and workspace management.
4. Render workspace detail as session list plus create-session control.
5. Preserve the existing session chat/timeline/artifact/review surface.

## Scope

- `apps/web/src/worker/router.ts`
- `apps/web/src/worker/api.ts`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/i18n.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- browser desktop and mobile validation

## Result

- Canonical Worker Web routes now start from `/workers/:workerId`.
- Worker home manages workers and workspaces with the existing visual system.
- Workspace routes own session creation and capability selection.
- Existing session chat/artifact/review surfaces remain intact.

## Verified

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
