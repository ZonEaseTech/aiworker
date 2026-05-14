# PLAN-301 Worker Web Soul Apps placement

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-13 19:18
- **relatedTask**: REFACTOR-079

## Current State

`WorkerStudio` renders `SoulAppsPanel` in the sidebar both before and after a
worker is selected. That panel expands developer details and mounted surface
previews inline, which makes the left rail carry two concepts at once: worker
navigation and installed app diagnostics.

Settings already has a `soul-packs` section, but it lists built-in Souls rather
than installed Soul Apps from `/api/local/apps`, so it cannot replace the rail
diagnostics yet.

## Decision

Move installed Soul App visibility to Settings:

```text
daily workbench rail -> worker / workspace / session navigation
first-run main surface -> enabled Soul App choices for worker creation
Settings > Soul Apps -> installed app lifecycle and diagnostics
```

The workbench should consume enabled apps through current worker/workspace
surfaces, not expose mount details in the rail.

## Scope

In scope:

- Update Worker Studio tests for the accepted UX contract.
- Remove the sidebar `SoulAppsPanel` and unused mounted-surface preview helpers.
- Pass installed apps into Settings and rename the Settings section to `Soul Apps`.
- Render installed app status, version, permission count, mounted contribution
  count and API prefix in Settings.
- Update focused CSS and i18n copy only where required.
- Sync PMA task, plan and changelog.

Out of scope:

- Backend API changes.
- Settings install/enable/disable mutations.
- New app-owned routes.
- HR workbench content redesign.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Delivery

- Worker rail now stays dedicated to worker/workspace/session navigation and no
  longer renders installed Soul App diagnostics beside the worker list.
- First-run still lets users start from enabled Soul Apps in the main workbench
  surface when no worker exists.
- Settings now owns installed Soul App visibility and diagnostics through the
  `Soul Apps` section.

## Verification Result

- Focused Worker Studio test passed with 26 tests.
- Web typecheck and build passed.
- Browser verification confirmed the rail no longer contains `Soul Apps` and
  Settings contains the installed HR/QA app summaries.
- code-review-graph review exited successfully with static test-gap hints only
  for small Settings display helpers.
