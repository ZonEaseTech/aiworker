# Soul App / Host Hybrid Autonomy Design

## Goal

AIWorker Soul App must be a real runnable vertical app, not a Host-internal
package projection. The target architecture keeps the default product path
local-first while allowing each Soul App to run standalone and to be mounted by
Host through an explicit protocol boundary.

## Current Finding

FEAT-060..065 created useful protocol, registry, SDK, broker, reference package
and developer harness prototypes, but the current result does not yet satisfy
the expected product boundary:

- HR and QA are under `packages/`, so the repo structure still declares them as
  shared libraries rather than independent apps.
- Their manifests are fixtures in `packages/shared`, not app-owned
  `apps/<id>/soul-app.manifest.json` files.
- Manifest entries point at app files such as `./src/standalone.ts` and
  `./src/host-mounted.ts`, but the reference packages currently only expose
  `src/index.ts`.
- The SDK standalone runtime creates workers with `manifest.soul.id` while the
  Host catalog projects app Souls as `manifest.id`, causing `hr` versus
  `aiworker-hr` identity drift.
- Host mounted API routes still reserve the namespace and return
  `SOUL_APP_API_NOT_LOADED`; external app handlers are not executed.
- Broker context currently trusts query-provided worker/workspace/session ids
  instead of resolving them against Host-owned metadata before write paths.

## Decision

Use a hybrid autonomy model:

- Standalone mode defaults to scheme 1: Soul App embeds a public local runtime
  adapter, owns app-local `worker.db`, workspace root, vertical UI/API, artifact
  and review loop.
- Mounted mode uses scheme 2 only at the Host boundary: Host discovers the app
  by static manifest, launches or connects to the app service, grants a scoped
  mount context, and brokers only Host-owned/shared capabilities.
- App-local business calls do not go through Host. Calls that cross into
  Host-owned resources must go through scoped broker routes.

The rule is:

```text
Soul App local UI/API -> Soul App embedded runtime -> app-local DB/workspace
Soul App mounted UI/API -> Soul App service -> Host broker only for shared resources
Host -> manifest discovery / install / health / launch / mount context / audit
```

## B Scope: App-Level Standalone Autonomy

Implement B as the immediate convergence target:

- Move reference Soul Apps to `apps/aiworker-hr` and `apps/aiworker-qa`.
- Each app owns its manifest, package scripts, protocol entrypoints,
  standalone entry, host-mounted entry, schemas, capabilities, review policy,
  pack assets, and tests.
- Each app can pass `aiworker app validate apps/<id>` and
  `aiworker app smoke apps/<id>`.
- Each app exposes `dev`, `build`, `serve`, `validate`, `smoke`, `typecheck`,
  and `test` scripts.
- The public SDK/runtime boundary is explicit: app code may use
  `@zonease/aiworker-soul-app-sdk`; it must not import Host private apps or
  other Soul Apps.
- Lint enforces app isolation and Host-private import boundaries.
- Worker, catalog, template and metadata identity use the app id consistently
  for app-origin Souls.

## C Scope: Full Host Mounted Interaction

Implement C after B without changing the core autonomy decision:

- Host registry keeps static manifest discovery and validation as the first
  gate.
- Host can launch/connect a local Soul App service using manifest-declared
  mounted runtime metadata.
- Host issues a scoped mount context containing app id, operator/workspace/
  session scope, broker URL and granted permission claims.
- Host mounted API namespace proxies to the app service only after enablement,
  health success and scope validation.
- App service calls back into Host broker for connector evidence, scoped
  storage, review creation, memory proposal and audit.
- Broker write paths validate worker/workspace/session ownership before
  mutating Host-owned records.
- Host Web can surface mounted app routes/panels from the manifest without
  importing the app source tree.

## Non-Goals

- No remote marketplace, untrusted third-party sandbox, remote control plane or
  cloud aggregation surface in this goal.
- No direct Host import of `apps/aiworker-*/src/*`.
- No cross-app import path between vertical apps.
- No raw Soul App access to Host engine scheduling, connector secrets, Host DB
  handles or global memory mutation.

## Acceptance

- `apps/aiworker-hr/soul-app.manifest.json` and
  `apps/aiworker-qa/soul-app.manifest.json` are the source of truth.
- `aiworker app validate apps/aiworker-hr` and
  `aiworker app validate apps/aiworker-qa` pass.
- `aiworker app smoke apps/aiworker-hr` and
  `aiworker app smoke apps/aiworker-qa` pass.
- Package-level HR/QA typecheck/test/build/serve smoke pass.
- Host mounted app API no longer returns `SOUL_APP_API_NOT_LOADED` for enabled
  apps with a healthy local service.
- Broker rejects mismatched worker/workspace/session scope writes.
- Root `typecheck`, `lint`, `test`, `build`, `git diff --check` and
  code-review-graph review pass or produce recorded, understood exceptions.

