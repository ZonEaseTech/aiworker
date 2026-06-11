# AIWorker Protocol

This document defines the canonical Soul descriptor contract, the local broker
routes, and the Phase 2 Host-to-Worker distribution control contract.

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
- `identity` is the Soul `id`, display `name`, and optional `description?`
  display metadata. Host and Workbench may show these fields, but must not
  interpret `description` as a domain capability, API, permission, or business
  workflow contract.
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

Overlay asset content is read and written through dedicated content routes, never
through the envelope. `GET /api/workers/:workerId/config/:configKey/content`
returns the effective `{ content, source, checksum, editable }`: the worker
overlay file when an enabled `worker-overlay://` overlay exists, otherwise the
baseline Soul-dist asset. `skill-overlay` and `entry-file-overlay` content is
editable; `mcp-overlay` content is view-only and redacted on display.
`PUT /api/workers/:workerId/config/:configKey/content` writes editable content to
the worker overlay file and upserts the envelope `sourceRef`/`checksum`; the
content reaches only the file, never the stored envelope. MCP content is not
editable and the PUT is rejected. A PUT to a not-yet-existing overlay `configKey`
adds an additive overlay plus its content file.

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
- `GET /api/workers/:workerId/config/:configKey/content` and
  `PUT /api/workers/:workerId/config/:configKey/content` read and write overlay
  asset content (skills and entry-files editable, MCP view-only and redacted);
  content lives in the worker overlay file, never the config envelope.

## Host-to-Worker Control Contract

The Host control plane is Phase 2 and is not on the v1 runtime path.
`packages/worker-control-protocol` defines a transport-agnostic control contract.
It covers worker.describe, worker.health, worker.lifecycle, and a worker.assignment
envelope. Phase 2 Host integration has two distribution-plane directions:

- Host initiates provisioning through aissh and owns assignment/readiness records.
- Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host.

These Worker-initiated signals are not runtime hot-path ownership. Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data. Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench.

Phase 2 Host-to-Worker integration is over-the-wire only, with zero code
intrusion in either direction. Host does not mount, frame, embed, render, or proxy
the Worker's Workbench. Host may direct an employee to a Worker-owned Workbench
URL, but that URL is an employee destination, not a Host-rendered surface.

The control contract must not carry session, invocation, projection, engine, or
domain data. The assignment envelope is a distribution record: it carries the
assigned Soul identity/version, authorized connectors, permissions, and an
engine/gateway profile ref by shape and version only. Connector behavior,
employee work, domain state, and native engine execution are out of contract
scope.

`worker.describe` may include the Worker-owned `workbenchUrl` so Host can direct
an employee to their Worker. It must not expose a mount entry, micro-app entry,
router mode, app-owned route, or Host-rendered surface.

The Phase 2 MVP contract is therefore:

```text
publish Soul version -> assign to employee/group -> provision employee Worker -> employee opens Worker Workbench
```

Phase 2 route block:

```text
POST   /api/provision/check-in
GET    /api/provision/access
GET    /workers/:workerId
```

The Host control plane also exposes admin-authorized control-plane routes for the
Soul release registry and distribution. These are Host API routes (`host:admin`
gated), not Worker broker routes, and are never on the Worker runtime path:

```text
GET    /api/host/options
GET    /api/host/assignments
POST   /api/host/assignments
GET    /api/host/soul-releases
POST   /api/host/soul-releases
```

`POST /api/host/soul-releases` publishes a built Soul descriptor into the
Host-owned registry. The request body is `{ descriptor, version? }`; Host
validates the descriptor-only v1 shape, assigns the version when omitted (next
integer per `soulId`), and stores the descriptor as an opaque release artifact.
`GET /api/host/soul-releases` lists registry releases as metadata
(`releaseRef`, `soulId`, `name`, `version`, `source`, `publishedAt`); the stored
descriptor content is not returned by the list route. `/api/host/options`
projects the same registry as the assignable Soul list. The matching host-cli
commands are `aiworker-host soul publish <descriptor> [--version]` and
`aiworker-host soul list`; `aiworker-host serve --seed-souls-dir <dir>` is a
dev-only convenience that seeds the registry from built descriptors when empty.

`POST /api/provision/check-in` returns a `{ access, assignment }` receipt. The
`assignment` receipt carries `assignedEmail`, `assignmentId`, `soulReleaseRef`,
`workerId`, and an optional `soulDescriptor`. `soulDescriptor` is the opaque
descriptor JSON string (the stored `descriptorJson` of the release resolved from
`soulReleaseRef`). Host delivers it as an opaque distribution artifact: it does
not parse, interpret, or rewrite the descriptor's domain fields. The descriptor
contains no literal secret — `POST /api/host/soul-releases` already enforces this
via `assertNoLiteralSecrets` at publish time. `soulDescriptor` is optional in the
contract so an older Host that does not populate it still produces a parseable
receipt; a Host that resolves `soulReleaseRef` to a missing release fails the
check-in honestly (4xx `SOUL_RELEASE_NOT_FOUND`) rather than returning a receipt
without descriptor content.

Resolving `soulReleaseRef` to descriptor content and installing it on the Worker
end-to-end (the Worker landing the delivered descriptor, binding its Soul, and
serving its own Workbench) is the remainder of this distribution slice. Until the
Worker consumes `soulDescriptor`, `soulReleaseRef` also remains a distribution
label and the Worker installs its own bundled descriptor.
Production governance wiring for connector authorization, permission sets,
gateway/profile refs, and Soul release rollout/rollback controls remains the
next Phase 2 governance slice. Do not add one-off v1 Worker runtime hooks,
Worker broker routes, or partial propagation paths for those governance records.

Phase 2.1 Worker Access tunnel:

```text
GET /api/provision/access
Upgrade: websocket
Authorization: Bearer <worker-access-token>
```

WebSocket is the only Worker Access tunnel transport in Phase 2.1. There is no
HTTP long-poll fallback. Host performs transport-level forwarding over the
Worker-initiated tunnel; Host does not mount, iframe, proxy-render, own, or
semantically interpret the Worker Workbench.

Phase 3 LLM credential frames ride the same already-authenticated Worker Access
tunnel (a `hello` frame authenticated by the Phase 2 access token) as three
independent typed frames in `workerAccessFrameSchema`:

```text
credential_acquire  { type, engineKind }                                worker -> host
credential_refresh  { type, engineKind }                                worker -> host
credential_grant    { type, engineKind, gatewayUrl, token, expiresAt }  host -> worker
```

- `engineKind` is `'anthropic' | 'openai'`. `cursor` is excluded because its CLI
  does not route an externally supplied key; other engines are not in the
  org-key injection set.
- `credential_acquire` is the Worker asking the Host to mint/return a credential
  for an engine kind; `credential_refresh` renews one approaching expiry. Both
  are Worker-initiated (the credential path is, like check-in and the tunnel
  itself, a Worker-initiated distribution signal, not Host runtime ownership).
- `credential_grant` is the Host response and is a **distinct frame type**. It
  must never reuse the `response` type, which carries the Host's pending
  HTTP request/response correlation semantics; mixing them would route a
  credential into the HTTP-forward correlation map.

WAT-1 boundary: these are typed frames, not `bodyText` HTTP forwarding. Their
fields live directly in the frame body, never in `bodyText`, and they never
enter the Host pending request/response correlation map. They are therefore
unaffected by WAT-1 (which corrupts only `bodyText` HTTP forwarding) and are not
subject to the 15s HTTP-forward timeout.

Secret boundary: `credential_grant.token` is a provider credential. It lives only
in Worker memory (and TLS in transit); it is never written to the descriptor,
host.db, worker.db, the `access-token` file, any log, diagnostic output, or
receipt. In the org-key mode (Phase 3 v1) the delivered `token` is the org key
as-is — not a derived/per-worker/short-TTL key — and `expiresAt` is a far-future
placeholder, so liveness/revocation rides the 4401 access-token channel, not TTL
expiry. The native CLI persisting the credential to its own credential store is
an engine concern outside this contract.

Provisioning adapters must deliver only:

```text
AIWORKER_HOST_URL
AIWORKER_PROVISION_TOKEN
```

Do not add AIWORKER_WORKER_ACCESS_LOCAL_URL. The Worker mints its own worker id,
and worker home and daemon port are fleet-allocated; the Worker runtime resolves
its own local handler.

Host URLs are environment-specific:

- `hostBrowserBaseUrl` generates `/host` and `/workers/:workerId`.
- `hostControlBaseUrl` is the Host API URL.
- `adapterRuntimeControlBaseUrl` is the URL reachable from the Worker runtime environment.

A remote aissh target must not use localhost, 127.0.0.1, or ::1 as its adapter runtime callback URL.

Host owns the publish/assign/provision governance path. Worker owns the
Workbench, workspace, session, invocation, projection, engine bridge, runtime
configuration overlays, and redaction. This split is what makes Soul replication
cheap without turning Host into a runtime backend or UI container.
