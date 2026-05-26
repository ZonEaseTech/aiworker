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

## Configuration

Configuration is worker-scoped and SDK-standard. Values use stable envelopes
stored in Host metadata. Configuration may contain non-secret operational
options, source refs, checksums, caller class, and projection-affecting state.

Configuration must not store Soul domain records, business actions, artifact
content, provider API keys, engine auth tokens, full native MCP file contents,
full skill file contents, or full projected entry file contents.

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
POST   /api/app-installation/apps/:appId/enable
POST   /api/workers
GET    /api/workers/:workerId
GET    /api/workers/:workerId/config
PUT    /api/workers/:workerId/config/:configKey
POST   /api/workspace-locators
GET    /api/workspace-locators/:workspaceId
POST   /api/sessions
GET    /api/sessions/:sessionId
POST   /api/sessions/:sessionId/invocations
GET    /api/engine/targets
GET    /api/engine/targets/:target/readiness
POST   /api/engine/invocations
GET    /api/engine/invocations/:invocationId
GET    /api/engine/invocations/:invocationId/events
POST   /api/engine/invocations/:invocationId/cancel
POST   /api/projections/:target/refresh
GET    /api/projections/receipts/:receiptId
POST   /api/projections/receipts/:receiptId/cleanup
GET    /api/mount/workbench
ANY    /api/apps/:appId/*
```

These are broker routes, not business product APIs.
