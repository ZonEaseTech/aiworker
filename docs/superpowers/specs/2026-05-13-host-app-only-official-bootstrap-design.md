# Host App-Only Official Bootstrap Design

## Goal

AIWorker Host must not own or ship business Soul definitions as runtime
built-ins. Official first-party Soul Apps such as `aiworker-hr` and
`aiworker-qa` enter the Host catalog through the same install and enable
lifecycle as every other Soul App, with a shorter trusted bootstrap path.

## Current Finding

The Soul App architecture now has app-owned manifests, standalone runtime,
mounted service execution, brokered Host calls and renderer-aware mounted
surfaces. The remaining boundary drift is in Host catalog projection:

- `packages/core/src/soul-app/registry.ts` still merges
  `BUILTIN_VERTICAL_SOULS` and `BUILTIN_CAPABILITY_TEMPLATES` into
  `listHostSoulCatalog()`.
- `findHostSoul()` and `findHostCapabilityTemplate()` still fall back to
  Host-owned built-in definitions before checking installed Soul Apps.
- CLI/API/Web tests still assume legacy IDs such as `hr`, `pm`, `qa` and
  `devops` are always present.
- Official HR and QA apps are already present under `apps/*`, so keeping
  `hr`/`qa` as Host-owned runtime definitions creates two sources of truth.

## Decision

Use an app-only Host catalog:

```text
Host catalog = installed Soul Apps + lifecycle state + manifest projection
Host built-in business Souls = none
Official business Souls = allowlisted Soul Apps installed and enabled by bootstrap
```

Host may know where official manifests live, but it must not carry their Soul
or capability definitions in runtime code. The official shortcut calls the same
registry lifecycle used by third-party apps:

```text
official allowlist -> installSoulAppFromPath(...) -> enableSoulApp(...)
```

This keeps the product default usable while preserving the architecture rule
that Host does not own vertical business logic.

## Official Bootstrap Semantics

The first-party bootstrap is idempotent and conservative:

- The official allowlist contains only app IDs and manifest paths for
  `apps/aiworker-hr/soul-app.manifest.json` and
  `apps/aiworker-qa/soul-app.manifest.json`.
- Missing official apps are installed and enabled.
- Already enabled official apps are revalidated so manifest changes and health
  status are refreshed.
- Installed or error official apps are enabled after successful validation.
- Explicitly disabled official apps remain disabled after daemon restart; their
  manifest metadata may refresh, but Host must not silently override the
  operator's disabled state.
- No arbitrary `apps/*` directory scan is allowed.

Fresh local Host startup should therefore show HR and QA by default because the
official bootstrap installed and enabled them, not because they were Host
built-ins.

## Product Scope

This slice intentionally accepts a temporary catalog coverage regression:

- Keep `aiworker-hr` and `aiworker-qa` as the only official bootstrapped apps.
- Remove `pm`, `devops`, `finance`, `legal` and `ops` from the runtime catalog
  until they are implemented as official Soul Apps.
- Do not preserve legacy `hr` or `qa` aliases for new worker creation.

Existing persisted workers with legacy IDs are outside this slice. They may be
reported as unavailable by the current catalog until a migration strategy is
designed.

## Components

- Core registry owns app-only catalog projection and official bootstrap logic.
- API daemon calls official bootstrap during local runtime startup before Web
  loads catalog-dependent data.
- CLI exposes an explicit official bootstrap command for repair and diagnostics.
- Web consumes the same app-only catalog and handles empty, disabled and error
  states without assuming built-ins.
- Tests switch worker creation and template lookup from `hr`/`qa` to
  `aiworker-hr`/`aiworker-qa`.

## Error Handling

- Missing official manifest path records a deterministic bootstrap failure and
  does not reintroduce built-ins.
- Invalid manifest keeps the app in `error` state with validation issues.
- Missing connectors keep existing warning behavior instead of blocking catalog
  projection.
- Disabled official apps remain unavailable for new workers and are displayed
  as disabled app lifecycle state.

## Acceptance

- `listHostSoulCatalog()` returns no business Souls when no Soul App is
  installed.
- Fresh Host/API startup bootstraps `aiworker-hr` and `aiworker-qa` through
  install and enable, making both available as app-projected Souls.
- Disabling `aiworker-hr` and restarting the daemon does not re-enable it.
- API/CLI worker creation with `soulId: "hr"` fails; `soulId:
  "aiworker-hr"` succeeds after official bootstrap.
- `aiworker app bootstrap official` is idempotent and reports install/enable
  outcomes.
- Legacy built-in catalog imports are removed from Host runtime paths.
- Focused tests, root gates, `git diff --check`, and code-review-graph review
  pass or record a precise blocker.

