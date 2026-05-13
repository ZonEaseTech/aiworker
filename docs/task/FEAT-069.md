# FEAT-069 Host app-only catalog and official Soul App bootstrap

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 12:24
- **plan**: PLAN-294
- **relatesTo**: FEAT-060, FEAT-061, FEAT-066, FEAT-068, packages/core, apps/api, apps/cli, apps/web, apps/aiworker-hr, apps/aiworker-qa

## Description

Remove Host-owned business Soul built-ins from the runtime catalog. Official
first-party Soul Apps remain available by entering the registry through an
idempotent install and enable bootstrap, starting with `aiworker-hr` and
`aiworker-qa`.

Acceptance criteria:

- Host catalog projection is app-only and no longer falls back to
  Host-owned `hr`, `qa`, `pm`, `devops`, `finance`, `legal` or `ops` Souls.
- Fresh local daemon startup installs and enables official HR/QA apps through
  the normal Soul App lifecycle.
- Explicitly disabled official apps are not silently re-enabled by daemon
  restart or bootstrap refresh.
- API and CLI worker creation reject legacy `hr` and accept `aiworker-hr` after
  official bootstrap.
- CLI exposes an explicit `app bootstrap official` repair/diagnostic command.
- Worker Web and tests no longer assume built-in catalog coverage.
- Focused and root verification gates pass, followed by code-review-graph
  review.

## ActiveForm

Converting Host catalog semantics from built-in business Souls to app-projected
Soul Apps, with official HR/QA installed and enabled by a first-party bootstrap.

## Notes

- 2026-05-13 12:24: Created and claimed after user approved option A: remove
  all Host built-in business Souls immediately, keep only current HR/QA official
  apps in the shortcut bootstrap path, and let PM/DevOps/finance/legal/ops
  disappear from runtime catalog until they become Soul Apps.
- 2026-05-13 12:43: Completed. Host catalog is now app-only, official HR/QA
  bootstrap uses the normal install/enable lifecycle, disabled official apps are
  preserved across daemon restart, CLI exposes `app bootstrap official`, and
  API/CLI/Web tests now use app-projected Soul IDs.
