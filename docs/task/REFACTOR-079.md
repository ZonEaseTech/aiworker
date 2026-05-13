# REFACTOR-079 Move Soul Apps management out of the worker rail

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 19:18
- **plan**: PLAN-301
- **relatesTo**: REFACTOR-078, FEAT-069, FEAT-070, apps/web, Settings, Soul Apps

## Background

Worker Web currently shows a `Soul Apps` rail card beside the worker list. Once a
worker exists, that card competes with the worker/workspace/session navigation
and exposes mounted-surface implementation details such as API routes, slots and
widgets in the daily workbench.

The accepted UX direction is that Worker Web should keep the workbench focused on
work objects. Soul Apps remain visible in first-run / create-worker entry points,
while installed app management and diagnostics move to Settings.

## Goals

1. Remove the always-visible `Soul Apps` card from the worker rail and first-run
   sidebar.
2. Keep first-run creation from enabled Soul Apps in the main surface when no
   worker exists.
3. Add a Settings section for installed Soul Apps with lifecycle, capability and
   mounted-diagnostic summaries.
4. Keep worker/workspace/session routes Host-owned; do not introduce app-owned
   browser routes.

## Non-goals

- Do not change Soul App registry, mount runtime, broker APIs or manifest schema.
- Do not implement install/enable/disable mutations in Settings in this slice.
- Do not redesign the HR People Profile workbench.

## Acceptance Criteria

- With existing workers, the left rail shows worker/workspace/session navigation
  only and does not render `Soul Apps (n)`.
- With no workers, the main first-run surface still offers enabled Soul Apps as
  creation choices.
- Settings has a `Soul Apps` section that lists installed apps, status/version,
  permissions and mounted contribution summary.
- Focused Worker Web tests cover the new placement.

## Completion Notes

- Removed the sidebar Soul Apps card and mounted-surface preview diagnostics from
  `WorkerStudio`.
- Kept the no-worker first-run main surface backed by enabled installed Soul
  Apps.
- Replaced Settings' built-in Soul pack listing with installed Soul App cards
  showing status, version, domain, permission count, template count, mounted
  contribution count and API prefix.
- Updated focused Worker Studio coverage for the new rail and Settings contract.

## Verification

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser verification on `http://localhost:5173`
- `bun run crg:update`
- `bun run crg:review`
