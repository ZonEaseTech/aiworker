# FEAT-067 Harden Soul App mounted runtime and authoring readiness

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 02:32
- **plan**: PLAN-292
- **relatesTo**: FEAT-060, FEAT-061, FEAT-062, FEAT-063, FEAT-064, FEAT-065, FEAT-066, packages/soul-app-sdk, apps/api, apps/cli, apps/web

## Description

FEAT-066 proved that Soul Apps can be app-level products under `apps/`, run
standalone, and mount into Host through a local service. The next zero-trust
slice must harden the mounted boundary and make the authoring surface ready for
more app teams before publishing the branch.

Acceptance criteria:

- SDK authoring package no longer depends on Host runtime or worker DB packages.
- Runtime/test harness helpers move to a separate package so app code can depend
  on SDK while tests and standalone shells use runtime explicitly.
- Manifest and Host proxy reject non-loopback mounted service URLs.
- Host mounted proxy strips caller credentials, injects Host-owned scoped
  headers and a mount token, times out upstream calls, and tears down launched
  services when an app is disabled.
- Worker Web shows mounted API/UI contributions as product-visible app
  affordances, not only raw lifecycle rows.
- `aiworker app create` generates a full standalone and host-mounted starter
  layout, and the generated app validates and smokes through both modes.
- PMA docs, focused tests, root gates and code-review-graph review are recorded.

## ActiveForm

Hardening Soul App mounted execution and separating public SDK authoring from
runtime harness internals.

## Dependencies

- **blocked by**: FEAT-066
- **blocks**: Soul App marketplace, third-party app contribution flow, mounted
  app security review, branch publication.

## Notes

- 2026-05-13 02:32: User requested the first five follow-up items without branch
  publication: zero-trust review/fixes, product-level mounted Web acceptance,
  SDK/runtime split, mounted service hardening, and scaffold upgrade.
- 2026-05-13 03:34: Completed. Split public SDK authoring from
  `@zonease/aiworker-soul-app-runtime`, hardened mounted service loopback/token
  and proxy behavior, surfaced mounted contributions in Worker Web, upgraded
  scaffold output to standalone/host-mounted app layout, verified HR/QA app
  token checks, browser-smoked the mounted rail, and passed root gates.
