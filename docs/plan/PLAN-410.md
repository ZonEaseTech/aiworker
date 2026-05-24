# PLAN-410 Mounted workspace locator propagation

- **status**: completed
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-153

## Proposal

1. Extend the mounted micro-app child event union with an opaque workspace locator event.
2. Normalize the event in Host Web's micro-app runtime adapter.
3. Dispatch the event after the universal workbench creates a workspace through the mounted API.
4. Let `MountedSoulAppRouteSurface` pass the workspace id to `WorkerStudio`, which updates route state.
5. Cover the Web-created QA workspace flow with a focused WorkerStudio test.

## Verification

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`

## Verification Result

- Passed: `bun run --filter '@zonease/aiworker-shared' test`
- Passed: `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- Passed: `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- Passed: `bun scripts/check-soul-app-boundaries.ts --completion-audit`
