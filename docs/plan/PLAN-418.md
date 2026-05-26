# PLAN-418 Universal workbench empty composer layout

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-26
- **relatedTask**: BUG-161
- **superpowersSpec**: docs/superpowers/specs/2026-05-26-universal-workbench-empty-composer-layout-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-26-universal-workbench-empty-composer-layout.md

## Context

The selected-workspace/no-session branch in `UniversalWorkbenchApp` currently renders the new-session composer with a smaller fixed cap and without an explicit empty-state slot. The desired product feel is a centered Codex-like input group with a balanced maximum width.

## Proposal

1. Add static-render coverage for the empty workspace composer state before changing the layout.
2. Add an explicit empty-state data slot to the selected-workspace/no-session branch.
3. Change the new-session composer width from the current compact cap to `w-full max-w-3xl`.
4. Keep active-session follow-up composer, timeline and Host mounted code unchanged.

## Verification

- `bun run --filter '@zonease/aiworker-soul-app-workbench' test src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`
