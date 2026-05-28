# AIWorker Protocol

This document defines the canonical Host/Soul protocol contract.

## Descriptor-Only Install And Runtime

Soul Apps are installed through:

```text
dist/soul.descriptor.json
```

Host validates and caches the descriptor, then routes local operations through
generic broker APIs. Host does not read app source, import app-private modules,
or interpret domain semantics.

## Descriptor V1 Shape

Descriptor v1 contains only these top-level sections:

```text
protocol
identity
compatibility
capabilities
configuration
workbench
api
engine
health
extensions
external
```

Core sections are strict. `extensions` and `external` are opaque to Host unless a
future protocol version promotes a field into the standard contract.

Descriptor v1 must not introduce memory, lesson, governance, repository workflow,
or domain business concepts as platform primitives.

## Capabilities

A capability is a generic startable unit. Host can list and select capabilities,
but Soul App owns what the work means. Host may pass capability id and locator
context to the engine bridge and mounted surfaces.

Host-facing session creation bodies and local session protocol objects use
`capabilityId` for the selected capability. `capabilityTemplateId` is not a
current API, OpenAPI, CLI, Web, mounted-surface, or diagnostic contract. Legacy
SQLite column names may remain as storage implementation details during
migration, but they must not leak into broker contracts.

## Configuration

Configuration is worker-scoped and SDK-standard. Values use stable envelopes
stored in Host metadata. Configuration may contain non-secret operational
options, source refs, checksums, caller class, and projection-affecting state.

Worker configuration values use a `configValueJson envelope` with the standard
fields `kind, target, enabled, sourceRef, checksum, options, updatedAt, updatedBy`.
`kind` is one of `engine-selection`, `projection-overlay`,
`skill-overlay`, `mcp-overlay`, `entry-file-overlay`, `workbench-preference`, or
`sdk-extension`. `target` is an engine target, `all`, or `none`. `options` is a
non-secret operational object. `updatedBy` records caller class such as `cli`,
`web`, or `app-owned-api`, not user identity.

Config values must not contain literal secrets, full native MCP files, full skill bodies, full entry-file contents, Soul domain records, business action state, or artifact content.

## Mounted Workbench

Production mounted workbench surfaces use micro-app with:

```text
router-mode="search"
```

Host resolves one workbench entry:

- custom Soul workbench when the descriptor exposes one;
- SDK common workbench fallback when no custom workbench exists.

Host passes locator context and mount data only. Soul owns internal routes,
domain rendering, app-owned actions, and app-owned API usage.

## App-Owned API

Descriptor v1 may expose an app-owned local API entry. Host may proxy it under a
generic local path and attach worker/workspace/session context when present.

Host does not interpret app-owned route names such as candidates, reports,
releases, reviews, artifacts, or profiles.

## Engine And Projection References

Descriptor engine sections describe packaged asset refs and target capabilities.
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

GET    /api/capabilities

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

POST   /api/projections/:target/refresh
GET    /api/projections/receipts/:receiptId
POST   /api/projections/receipts/:receiptId/cleanup

GET    /api/mount/workbench
ANY    /api/apps/:appId
ANY    /api/apps/:appId/*
```

These are broker routes, not business product APIs.

Route methods make the local broker deterministic. They do not turn the daemon
into a product backend.

- `enable` creates a worker from an installed descriptor.
- archive operations mark Host metadata unavailable for new work.
- hard delete removes Host metadata and receipt-owned projections only.
- `GET /api/workspace-locators` may receive `workerId` to filter locators for
  mounted app contexts.
- `POST /api/workspace-locators` receives `workerId`, may receive `rootPath`,
  and creates Host workspace locator metadata plus projection-owned bootstrap
  files.
- `GET /api/sessions` may receive `workerId` and `workspaceId` to filter
  mounted app context session lists.
- `POST /api/sessions` receives `workerId` and `workspaceId` as locator context.
- session follow-up always uses `POST /api/sessions/:sessionId/invocations`.
- engine cancel and event stream target an invocation id.
- engine target discovery and test actions live under `/api/engine/targets`,
  not local settings route aliases.
- `GET /api/capabilities` may receive `workerId` to filter capabilities to the
  worker's Soul App for mounted app contexts.
- app-owned API proxy attaches locator context when present and does not
  interpret domain route names. It strips client credentials before proxying and
  strips app-owned cookies plus Host mount credentials before returning.
