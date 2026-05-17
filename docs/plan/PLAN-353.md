# PLAN-353 Soul App scaffold workbench design migration

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **completedAt**: 2026-05-18
- **relatedTask**: REFACTOR-082

## Current State

The shared manifest and official HR/QA apps use `ui.workbench` and
`ui.workspaceContext`, but the `aiworker app create` scaffold was still a
minimal mounted-surface template without app-owned workbench descriptors or
smoke coverage for declared workbench protocols.

## Proposal

1. Add `ui.workbench` action/search/settings descriptors to scaffolded
   manifests.
2. Add `ui.workspaceContext.terminal` to scaffolded manifests with
   `host-workspace-root` cwd source.
3. Add `/protocol/actions` and `/protocol/search` implementations to the
   generated Host-mounted service.
4. Extend `aiworker app smoke` to call one declared workbench action and search
   provider when present.
5. Update authoring docs and CLI docs so new Soul Apps start from the current
   Host header / Soul workbench boundary.

## Verification

- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts -t "scaffolds, validates, and smokes a minimal Soul App"`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun run --filter '@zonease/aiworker-qa' smoke`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
