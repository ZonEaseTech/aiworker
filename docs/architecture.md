# AIWorker Architecture

This document is the canonical architecture contract for AIWorker after the
destructive refactor. Older PMA notes, changelogs, historical audits, old local
skills, and temporary drafts are evidence only. They do not override this file.

## Position

AIWorker is a worker-centric product. A Worker is an autonomous, CLI-first
runtime that runs one Soul App through a native engine and owns engine launch.

A Worker runs fully standalone. Host is never on the runtime hot path.

Host is an optional control plane: distributor, manager, permission allocator,
and connector authorizer.

The default product paths are:

```text
Worker -> Soul App -> workspace locator -> session -> app-owned work
Host -> distribute / manage / authorize / connector -> mount worker config micro-app
```

A Worker starts its own local infrastructure, locates workspace/session context,
serves its own employee web, owns projection and the engine bridge, launches and
observes the native engine, and exposes a control surface. Host distributes,
manages, allocates permissions, authorizes connectors, and mounts a Worker's
configuration micro-app to configure it. Host does not spawn, observe, or hold engine processes. Host is not a domain workflow layer, a product backend, an agent
runtime, a repository dashboard, or a Soul App configuration center.

## Decision Coverage Index

tmp/refactor decisions are evidence until promoted. Accepted refactor decisions
become active authority only when they are represented in the canonical docs,
guarded by tests, or both.

- docs/architecture.md owns worker autonomy, Host control-plane ownership, monorepo
  boundaries, data ownership, Freeform v1 scope, and destructive migration
  constraints.
- docs/protocol.md owns descriptor, broker route, configuration envelope, mounted workbench, and app-owned API contracts.
- docs/runtime.md owns projection, runtime assets CRUD, engine bridge, lifecycle, cleanup, and redaction contracts.
- docs/soul-authoring.md owns SDK authoring, convention discovery, build output,
  native MCP source layout, and Freeform source contract.
- docs/testing.md owns the coverage ledger and guardrail mapping.
- worker-control-protocol owns the transport-agnostic Host↔Worker control contract.

## Ownership

Soul Apps, also called Templates, own domain state, domain UI/API, business
outputs, confirmation actions, app-owned history, standalone experience, mounted
product experience, descriptor production, and engine target declaration.
A Worker is a running instance of a Soul App.

A Worker owns its runtime state:

- the Soul descriptor or template it runs;
- workspace locator and workspace root;
- session lifecycle metadata;
- engine invocations and engine process state;
- engine launch via the engine bridge;
- projection, projection receipts, and receipt-based cleanup;
- worker-scoped configuration overlays;
- its own employee web and app-owned API proxy;
- its own storage and filesystem root;
- redaction of its own output.

Host owns only control-plane metadata:

- the worker registry: which workers exist, identity, endpoint, health;
- assignment metadata: assigned template/soul, connectors, engine/gateway profile, permissions;
- permission allocation and connector authorization;
- worker distribution and provisioning records.

Host must not own session, invocation, projection, engine processes, domain
state, or secrets. A Worker must not depend on Host to run. Worker packages must
not import Host packages.

## Daemon Topology (daemon-per-worker)

A Worker daemon hosts at most one active Worker. The fleet is N worker daemon
processes, each with its own storage root; an optional Host control plane brokers
across worker endpoints by endpoint. A Worker daemon carries zero fleet/Host
awareness: it is a passive control server, and Host is the active client that
discovers and connects in. The Worker never registers with or pushes to Host.
`worker-*` packages must not import `host-*` packages — a runtime direction rule,
not only a build-time dependency rule.

The fleet is a plug-in shell layered from outside; the Worker stays pure. Fleet
membership state lives entirely on the Host side. Plugging a Worker into a fleet
means Host learns its endpoint from out-of-band configuration; unplugging means
Host forgets the endpoint while the Worker keeps running standalone. The Worker
binary and behavior do not change whether a fleet is present or absent. The
`workerId` is the Worker's own minted identity, not a fleet-imposed handle.

Phase 1 scope: the standalone single-daemon path is complete and usable — one
daemon is one Worker with its own CLI, web, and configuration micro-app. Fleet
brokering (Host endpoint registry persistence and endpoint discovery) is Phase 2
and not yet available; an in-memory registry without endpoint discovery means the
fleet is not yet operable. This is a self-consistent intermediate state only
because this document says so.

## Monorepo Boundary

The target top-level shape is:

```text
apps/
  worker-cli/
  worker-web/
  host-cli/
  host-web/

souls/
  aiworker-freeform/

packages/
  worker-runtime/
  worker-daemon/
  host-control/
  worker-control-protocol/
  soul-protocol/
  soul-app-sdk/
  soul-app-runtime/
  soul-workbench/
  engine-bridge/
  engine-projection/
  storage-sqlite/
  fs-layout/
  ui/
```

`apps/*` are runnable product shells. `souls/*` are descriptor-producing Soul App
product packages. Package and app names are plane-prefixed: `worker-*` owns the autonomous runtime;
`host-*` owns the control plane; capability packages keep capability names and are
consumed mostly by Workers. `worker-*` packages must not import `host-*` packages. For v1 strong acceptance, Freeform is the only shipped Soul;
retired HR/QA app-local source trees stay deleted until they are re-authored as
descriptor-producing `souls/*` packages.

`packages/core and packages/shared disappear` as broad buckets. Do not create
`core-v2`, `shared-v2`, or any replacement dumping ground.

`apps/api` migrated into `packages/worker-daemon`. The control plane lives in
`packages/host-control` with `apps/host-cli` and `apps/host-web` shells.

## Protocol Boundary

The Host/Soul boundary is descriptor-only. A Worker installs and runs Soul Apps from
`dist/soul.descriptor.json`. Host must not read Soul source, import Soul private
modules, or interpret domain fields.

Descriptor v1 is intentionally narrow: identity, compatibility, capabilities,
configuration, workbench, api, engine, health, extensions, and external.
Extensions are namespaced and opaque unless a future protocol version promotes
them into the standard contract.

Production mounted workbench surfaces use micro-app with
`router-mode="search"`. The Worker daemon resolves one workbench entry; Host
passes locator context and mounts. Soul owns internal routes and domain
rendering.

The Host-to-Worker boundary is a transport-agnostic control contract owned by
`packages/worker-control-protocol`. A Worker is the passive control server; Host is the client; a Worker never
initiates a connection to Host. The control contract covers worker describe, health, instance lifecycle, and an
assignment envelope. It must not carry session, invocation, projection, engine,
or domain data.

Management mount lets Host configure a Worker through the Worker configuration
micro-app. The Worker web (`apps/worker-web`) renders the platform-generic
session surface itself — chat composer, engine-event chat view, and session
artifacts — from `packages/ui` shared primitives, because invocation, bridge
events, and artifacts are generic engine-interaction concepts rather than Soul
domain UI. Management mount is distinct from the employee mount that adds the
Soul's domain workbench of internal routes and domain rendering; employees
connect to the Worker web directly. In v1,
both share the single broker endpoint `GET /api/mount/workbench`; the
distinction is topological — Host frames the config micro-app in a managed
context, while employees connect directly to the same broker — not a different
URL. The mounted configuration micro-app is the only current control-contract
transport; non-web transports are reserved and must not be hardcoded out.

## Runtime Boundary

Session lifecycle is separate from native engine execution. A session is a Worker locator for workspace locator, selected capability, and
invocation references. Engine execution lives in `engine_invocations` and is
owned by the Worker. The Worker, not Host, prepares engine invocation context and observes native
engine output.

Follow-up is session-level:

```text
POST /api/sessions/:sessionId/invocations
```

Native engine integration uses B+ structured bridge:

- per-engine adapters;
- process management;
- redacted raw chunks;
- normalized bridge events;
- opaque external session refs;
- protocol-first cancel;
- reattach;
- reconciler.

The bridge does not own model calls, tool execution, approval flow, sandbox
policy, login state, engine profile state, or engine-native sessions.

## Freeform V1

`souls/aiworker-freeform` is the only strong v1 acceptance Soul. It proves the
framework loop: SDK authoring, descriptor build, descriptor-only install, worker
create, workspace locator create, worker config overlay, projection refresh,
session create, first invocation, session follow-up, cancel or completion,
mounted common workbench with `router-mode="search"`, and archive.

HR and QA remain first-party Soul identities, but they migrate after Freeform and
do not block the v1 framework loop.

## Destructive Migration Rules

Contract and guardrails come first:

1. Promote canonical docs and doc gates to worker autonomy.
2. Add red inversion guards (G1-G6).
3. Create target package skeletons: worker-control-protocol, host-control, apps/host-cli, apps/host-web.
4. Rename host-runtime to worker-runtime, host-daemon to worker-daemon, apps/cli to worker-cli, apps/web to worker-web.
5. Carve the host/worker split points into worker-runtime and host-control.
6. Implement the minimal Host↔Worker control contract.
7. Wire host-web management mount of the Worker configuration micro-app.
8. Make the Worker standalone golden path pass with Host absent.
9. Delete old authority and old names.
10. Update roadmap and memory.

Do not modify the new architecture to satisfy old E2E assumptions. Legacy
app-local adapter exports are removed, not migrated.
