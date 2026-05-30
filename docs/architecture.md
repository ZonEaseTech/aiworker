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

- docs/architecture.md owns product position, Host/Soul ownership, monorepo
  boundaries, data ownership, Freeform v1 scope, and destructive migration
  constraints.
- docs/protocol.md owns descriptor, broker route, configuration envelope, mounted workbench, and app-owned API contracts.
- docs/runtime.md owns projection, runtime assets CRUD, engine bridge, lifecycle, cleanup, and redaction contracts.
- docs/soul-authoring.md owns SDK authoring, convention discovery, build output,
  native MCP source layout, and Freeform source contract.
- docs/testing.md owns the coverage ledger and guardrail mapping.

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

The Host/Soul boundary is descriptor-only. Host installs and runs Soul Apps from
`dist/soul.descriptor.json`. Host must not read Soul source, import Soul private
modules, or interpret domain fields.

Descriptor v1 is intentionally narrow: identity, compatibility, capabilities,
configuration, workbench, api, engine, health, extensions, and external.
Extensions are namespaced and opaque unless a future protocol version promotes
them into the standard contract.

Production mounted workbench surfaces use micro-app with
`router-mode="search"`. Host resolves one workbench entry and passes locator
context. Soul owns internal routes and domain rendering.

## Runtime Boundary

Session lifecycle is separate from native engine execution. A session is a Host
locator for worker, workspace locator, selected capability, and invocation
references. Engine execution lives in `engine_invocations`.

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

1. Promote canonical docs.
2. Rewrite `AGENTS.md` as a short bootstrap.
3. Add contract test skeleton before deleting old authority.
4. Create target package skeleton.
5. Move protocol/schema.
6. Move daemon/API boundary.
7. Build strict Host metadata schema.
8. Build SDK descriptor and Freeform Soul.
9. Build projection and engine bridge.
10. Wire Web mount.
11. Delete old authority and paths.
12. Migrate QA/HR as samples.

Do not modify the new architecture to satisfy old E2E assumptions. Legacy
app-local adapter exports are removed, not migrated.
