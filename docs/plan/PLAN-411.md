# PLAN-411 Worker Configuration boundary cleanup

- **status**: approved
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-154

## Proposal

1. Remove projection props, state and actions from `WorkerConfigurationDialog`.
2. Keep worker-scoped workbench tab selection in a neutral Workbench panel.
3. Update WorkerStudio call sites so no selected workspace is passed into Worker Configuration.
4. Update tests to assert absent workspace configuration wording and retained worker overlay behavior.

## Verification

- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run ui:check`
