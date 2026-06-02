# AIWorker Protocol

This document defines the canonical Soul descriptor contract, the local broker
routes, and the Phase 2 Host-to-Worker control contract.

## Descriptor-Only Install And Runtime

Souls are installed through:

```text
dist/soul.descriptor.json
```

The Worker validates and caches the descriptor, then routes local operations through
generic broker APIs. The Workbench and Host do not read Soul source, import Soul
private modules, or interpret domain semantics.

## Descriptor V1 Shape

A Soul is a template — a descriptor-only bundle of engine assets. Descriptor v1
contains only these top-level sections:

```text
protocol
identity
engine
```

- `protocol` is the descriptor format version (`soul/v1`).
- `identity` is the Soul `id` and display `name`.
- `engine` declares engine targets and the packaged asset refs: workspace files,
  skills, native MCP files, and entry files such as `AGENTS.md` and `CLAUDE.md`.

Descriptor v1 carries no workbench, no app-owned API, no capabilities, and no
configuration, health, compatibility, extensions, or external sections. It must
not introduce memory, lesson, governance, repository workflow, or domain business
concepts as platform primitives. The Worker owns and renders its Workbench; the
Soul provides no UI.

## Configuration

Worker configuration is worker-scoped and SDK-standard; it is not a descriptor
section. Values use stable envelopes stored in Worker metadata, and may contain
non-secret operational options, source refs, checksums, caller class, and
projection-affecting state.

Worker configuration values use a `configValueJson envelope` with the standard
fields `kind, target, enabled, sourceRef, checksum, options, updatedAt, updatedBy`.
`kind` is one of `engine-selection`, `projection-overlay`, `skill-overlay`,
`mcp-overlay`, `entry-file-overlay`, or `workbench-preference`. `target` is an
engine target, `all`, or `none`. `options` is a non-secret operational object.
`updatedBy` records caller class such as `cli` or `web`, not user identity.

`projection-overlay` is reserved in descriptor v1. It is a valid stored
configuration kind and participates in the projection freshness marker, but
engine projection applies no projected-file change for it. Per-asset projection
overlays use `entry-file-overlay`, `skill-overlay`, and `mcp-overlay`.

Overlay `sourceRef` values are scheme-qualified references, never content.
`descriptor://…` resolves baseline assets from the Soul descriptor source.
`worker-overlay://<kind>/<path>` (with `kind` one of `skills`, `mcp`, or
`entry-files`) resolves worker-owned edited content from the worker overlay
store at `<worker-home>/overlays/<kind>/<path>`, the sibling of `workspaces/`.
Engine projection materializes the referenced file by scheme; the envelope still
carries only `kind, target, enabled, sourceRef, checksum`.

Config values must not contain literal secrets, full native MCP files, full skill bodies, full entry-file contents, Soul domain records, business action state, or artifact content.

## Engine And Projection References

Descriptor engine sections describe packaged asset refs and target engines.
Runtime projection materializes workspace files, skills, native MCP files, and
entry files for the selected engine target.

Descriptors may include lightweight summaries and refs. They must not copy
secret-like values from native files.

## Broker Routes

The local daemon broker exposes platform routes, including:

```text
POST   /api/app-installation/install
GET    /api/app-installation/apps
GET    /api/app-installation/apps/:appId
POST   /api/app-installation/apps/:appId/enable
POST   /api/app-installation/apps/:appId/archive
DELETE /api/app-installation/apps/:appId

GET    /api/info
GET    /api/settings
PATCH  /api/settings

POST   /api/workers
GET    /api/workers
GET    /api/workers/:workerId
PATCH  /api/workers/:workerId
POST   /api/workers/:workerId/archive
DELETE /api/workers/:workerId

GET    /api/workers/:workerId/config
PUT    /api/workers/:workerId/config/:configKey
PATCH  /api/workers/:workerId/config/:configKey
POST   /api/workers/:workerId/config/:configKey/archive

POST   /api/workspace-locators
GET    /api/workspace-locators
GET    /api/workspace-locators/:workspaceId
PATCH  /api/workspace-locators/:workspaceId
POST   /api/workspace-locators/:workspaceId/archive
DELETE /api/workspace-locators/:workspaceId

POST   /api/sessions
GET    /api/sessions
GET    /api/sessions/:sessionId
PATCH  /api/sessions/:sessionId
POST   /api/sessions/:sessionId/archive
DELETE /api/sessions/:sessionId
POST   /api/sessions/:sessionId/invocations

GET    /api/engine/targets
GET    /api/engine/targets/:target/readiness
POST   /api/engine/targets/rescan
POST   /api/engine/targets/:target/test
POST   /api/engine/invocations
GET    /api/engine/invocations/:invocationId
GET    /api/engine/invocations/:invocationId/events
POST   /api/engine/invocations/:invocationId/cancel
POST   /api/engine/invocations/:invocationId/reconcile

POST   /api/projections/:target/refresh
GET    /api/projections/receipts/:receiptId
POST   /api/projections/receipts/:receiptId/cleanup
```

These are broker routes, not business product APIs. Route methods make the local
broker deterministic. They do not turn the daemon into a product backend.

- `enable` creates a worker from an installed descriptor, bound to that one Soul.
- `POST /api/workers` rejects creation when the daemon already hosts an active
  Worker (409); a daemon hosts at most one active Worker. archive-then-recreate
  is permitted (archived rows do not count).
- Routes that take a `workerId` for new work resolve it to the daemon's single
  active Worker: a present `workerId` that does not name the active Worker is
  rejected. List and filter routes instead treat `workerId` as an existence
  filter — present scopes the result to that Worker, omitted returns the unscoped
  list, which on a single-active daemon is that active Worker's. The standalone
  CLI or Workbench web therefore never depends on Host or fleet context.
- `GET /api/workspace-locators` may receive `workerId` to filter locators.
- `POST /api/workspace-locators` receives `workerId` and a workspace name, and
  creates Worker workspace locator metadata plus projection-owned bootstrap
  files. Workspace roots are derived under the Worker home directory
  (`<worker-home>/workspaces/<workspaceId>`), not client-chosen: AIWorker is not
  a developer tool pointed at arbitrary repositories, so there is no custom
  `rootPath`.
- `GET /api/sessions` may receive `workerId` and `workspaceId` to filter session
  lists.
- `POST /api/sessions` receives `workerId` and `workspaceId` as locator context.
- session follow-up always uses `POST /api/sessions/:sessionId/invocations`.
- engine target discovery and test actions live under `/api/engine/targets`. The
  engine target defaults to the Worker default and may be overridden per session.
- engine cancel, event stream, and reconciler target an invocation id.

## Host-to-Worker Control Contract

The Host control plane is Phase 2 and is not on the v1 runtime path.
`packages/worker-control-protocol` defines a transport-agnostic control contract.
It covers worker.describe, worker.health, worker.lifecycle, and a worker.assignment
envelope. The Worker is the passive control server; Host is the client. A Worker
never initiates a connection to Host.

Phase 2 Host-to-Worker integration is over-the-wire only, with zero code
intrusion in either direction: Host frames the Worker's own Workbench web as a
sandboxed micro-app loaded over HTTP, and drives the control contract. The
control contract must not carry session, invocation, projection, engine, or
domain data. The assignment envelope carries authorized connectors, permissions,
and an engine/gateway profile ref by shape and version only; connector behavior
is out of contract scope.
