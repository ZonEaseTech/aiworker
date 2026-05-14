# FEAT-066 Converge Soul Apps into app-level standalone and mounted products

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 01:30
- **plan**: PLAN-291
- **relatesTo**: FEAT-060, FEAT-061, FEAT-062, FEAT-063, FEAT-064, FEAT-065, apps, packages/soul-app-sdk, apps/api, apps/cli, apps/web

## Description

FEAT-060..065 established a Soul App protocol prototype, but zero-trust review
found that HR and QA are still package-level examples, their app-owned
manifests and entrypoints are missing, standalone worker identity drifts between
Soul id and app id, Host mounted app APIs are reserved but not executed, and
broker write paths trust caller-supplied context too much.

This task completes the product expectation: a Soul App is a runnable app under
`apps/`, can run standalone with an embedded public local runtime, and can be
mounted by Host through manifest discovery, scoped service connection and
brokered shared capabilities.

Acceptance criteria:

- HR and QA live under `apps/aiworker-hr` and `apps/aiworker-qa`.
- Each app owns `soul-app.manifest.json`, protocol entries, standalone and
  host-mounted entries, package scripts, schemas, capabilities, review policy
  and pack assets.
- `aiworker app validate` and `aiworker app smoke` pass for both apps.
- App-origin worker/catalog/template identity uses the app id consistently.
- Lint or validation prevents cross-app imports and Host-private imports.
- Host mounted API calls for enabled healthy apps execute through a scoped
  mounted service path rather than returning `SOUL_APP_API_NOT_LOADED`.
- Broker write paths reject mismatched worker/workspace/session scope.
- Root gates and code-review-graph review are recorded.

## ActiveForm

Converging Soul Apps into app-level standalone products and completing Host
mounted execution.

## Dependencies

- **blocked by**: (none)
- **blocks**: Soul App marketplace, third-party app contribution flow, remote
  mounted app distribution.

## Notes

- 2026-05-13 01:30: User approved goal-mode execution for B and C in one goal.
  Current correction should add a new convergence task instead of rewriting
  FEAT-060..065 prototype completion history.
- 2026-05-13 02:11: Completed app-level HR/QA convergence under `apps/`,
  app-owned manifests/assets/entrypoints, SDK runtime identity correction,
  import boundary validation, Host mounted local service proxy, mounted service
  smoke, broker scope validation, docs, focused tests, root gates, and
  code-review-graph review.
