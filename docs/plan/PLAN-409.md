# PLAN-409 Web Claude Code failed-session recovery

- **status**: completed
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-152

## Proposal

1. Name and test the local CLI hard timeout in `packages/core/src/worker/executor.ts`.
2. Assert failed runtime turns return failed session, turn, invocation and event state.
3. Refresh selected session detail in the mounted universal workbench polling path so parent session status cannot stay stale.
4. Suppress stale running status signals and duplicate error rendering in the timeline.
5. Prove the failed session fixture renders recoverably.

## Verification

- `bun test packages/core/src/worker/executor.test.ts`
- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`

## Verification Result

- Passed: `bun test packages/core/src/worker/executor.test.ts`
- Passed: `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- Passed: `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
