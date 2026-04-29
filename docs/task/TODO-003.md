# TODO-003 Refresh Web build config and bundle budget warnings

- **status**: completed
- **priority**: P3
- **owner**: Unassigned
- **createdAt**: 2026-04-28 20:24
- **discoveredAt**: 2026-04-28 20:24
- **releaseTarget**: `@zonease/aiworker-cli@0.4.4`
- **bkd**: jltt378f

## Description

The Web production build passes, but the build emits maintenance warnings:

1. Vite/Rolldown reports deprecated `esbuild` and
   `optimizeDeps.rollupOptions` usage.
2. Vite recommends switching to `@vitejs/plugin-react-oxc`.
3. Fleet and worker JS bundles exceed the default 500 kB chunk warning.
4. `size:report` remains under the 20% threshold but shows roughly 13-15%
   growth over baseline for both bundles.

## Acceptance Criteria

1. Review the Vite 8/Rolldown React plugin configuration and remove avoidable
   deprecation warnings.
2. Decide whether to adopt `@vitejs/plugin-react-oxc` or document why not.
3. Review bundle splitting opportunities for Fleet and Worker bundles.
4. Keep `size:report` below the review threshold or update the baseline with a
   justified changelog entry.

## ActiveForm

Reviewing Web build deprecations and bundle size warnings

## Dependencies

- **blocked by**: none
- **blocks**: future Vite/Rolldown maintainability
- **relates to**: REFACTOR-009, BUG-030, QA-001

## Notes

- 2026-04-28 20:24 Recorded from `QA-001` reliability and parent build checks.
  No source fix was made in the validation session.
- 2026-04-28 20:31 Dispatched to BKD issue `jltt378f` and moved to `working`.
