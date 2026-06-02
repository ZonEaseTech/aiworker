# AIWorker Architecture

This document is the canonical architecture contract for AIWorker after the
destructive refactor. Older PMA notes, changelogs, historical audits, old local
skills, and temporary drafts are evidence only. They do not override this file.

## Position

AIWorker is a worker-centric product. A Worker is an autonomous, CLI-first
runtime that runs one Soul through a native engine and owns engine launch.

A Worker runs fully standalone. v1 ships the standalone Worker only; the Host
control plane is Phase 2 and is never on the runtime hot path.

A Worker is bound to exactly one Soul when it is created. The binding is fixed
for the Worker's whole life: every workspace the Worker creates is governed by
that one Soul.

A Worker owns and directly renders its Workbench — the Worker's own employee web.
The Workbench is not a mounted micro-app and is not provided by the Soul. v1 has
no micro-app anywhere. The Workbench manages the Worker's workspaces, the
sessions nested under each workspace, the session chat, and the Worker's own
configuration.

The default product path is:

```text
Worker -> Workbench -> workspace -> session (chat) -> native engine
```

A Worker starts its own local infrastructure, locates workspace/session context,
serves its own Workbench web, owns projection and the engine bridge, launches and
observes the native engine, and exposes a local broker API.

Host is an optional control plane: distributor, manager, permission allocator,
and connector authorizer. Host is Phase 2 and is never on the runtime hot path.
Host does not spawn, observe, or hold engine processes. Host is not a domain
workflow layer, a product backend, an agent runtime, a repository dashboard, or a
Soul configuration center.

## Decision Coverage Index

tmp/refactor decisions are evidence until promoted. Accepted refactor decisions
become active authority only when they are represented in the canonical docs,
guarded by tests, or both.

- docs/architecture.md owns worker autonomy, worker-owns-workbench, Soul-as-template,
  Host control-plane ownership, monorepo boundaries, data ownership, Freeform v1
  scope, and destructive migration constraints.
- docs/protocol.md owns descriptor, broker route, configuration envelope, and the
  Phase 2 Host↔Worker control contract.
- docs/runtime.md owns projection, runtime assets CRUD, engine bridge, lifecycle, cleanup, and redaction contracts.
- docs/soul-authoring.md owns SDK authoring, convention discovery, build output,
  native MCP source layout, and Freeform source contract.
- docs/testing.md owns the coverage ledger, guardrail mapping, and the Phase 2
  implementation-teardown debt.

## Ownership

A Soul is a template: a named, descriptor-only bundle of engine assets —
workspace files, skills, native MCP files, and entry files such as `AGENTS.md`
and `CLAUDE.md` — targeting one or more native engines. "Soul" is the
human-facing name; functionally it is a template. A Soul owns only that template
definition and its descriptor production. A Soul has no UI, no app-owned API, no
capability layer, and no domain backend; the work a session does comes from the
projected skills and entry files the native engine reads, plus the employee's
chat input.

A Worker is a running instance bound to one Soul. A Worker owns its runtime state:

- the Soul descriptor it is bound to;
- workspace locators and workspace roots;
- session lifecycle metadata;
- engine invocations and engine process state;
- engine launch via the engine bridge;
- projection, projection receipts, and receipt-based cleanup;
- worker-scoped configuration overlays;
- its own Workbench web and local broker API;
- its own storage and filesystem root;
- redaction of its own output.

Host (Phase 2) owns only control-plane metadata:

- the worker registry: which workers exist, identity, endpoint, health;
- assignment metadata: assigned Soul, connectors, engine/gateway profile, permissions;
- permission allocation and connector authorization;
- worker distribution and provisioning records.

Host must not own session, invocation, projection, engine processes, domain
state, or secrets. A Worker must not depend on Host to run. Worker packages must
not import Host packages — a runtime-direction rule retained even while the Host
plane is dormant in v1.

## Daemon Topology (daemon-per-worker)

A Worker daemon hosts at most one active Worker. A Worker daemon carries zero
fleet/Host awareness: it is a passive local server that serves its own CLI,
Workbench web, and configuration. The Worker never registers with or pushes to
Host.

v1 scope: the standalone single-daemon path is the whole product — one daemon is
one Worker with its own CLI, Workbench web, and configuration. The fleet — an
optional Host control plane that discovers and brokers across worker endpoints —
is Phase 2. In Phase 2 the fleet is a plug-in shell layered from outside; the
Worker stays pure, its binary and behavior do not change whether a fleet is
present or absent, and the `workerId` is the Worker's own minted identity, not a
fleet-imposed handle.

## Monorepo Boundary

The v1 top-level shape is:

```text
apps/
  worker-cli/
  worker-web/
  host-cli/      (Phase 2, dormant stub)
  host-web/      (Phase 2, dormant stub)

souls/
  aiworker-freeform/

packages/
  worker-runtime/
  worker-daemon/
  host-control/             (Phase 2, dormant stub)
  worker-control-protocol/  (Phase 2, dormant stub)
  soul-descriptor/
  soul-sdk/
  engine-bridge/
  engine-projection/
  storage-sqlite/
  fs-layout/
  ui/
```

`apps/*` are runnable product shells. `souls/*` are descriptor-producing Soul
template packages. Package and app names are plane-prefixed: `worker-*` owns the
autonomous runtime; `host-*` owns the Phase 2 control plane; shared capability
packages keep their names and are consumed by Workers. The descriptor-protocol
package is `soul-descriptor` and the authoring SDK is `soul-sdk`; both drop the
retired `soul-protocol` / `soul-app-sdk` "soul-as-app" names. `worker-*` packages must not
import `host-*` packages. For v1 strong acceptance, Freeform is the only shipped
Soul; retired HR/QA app-local source trees stay deleted until they are re-authored
as descriptor-producing `souls/*` packages.

The Workbench has no package of its own: it lives in `apps/worker-web`, composed
from `packages/ui` primitives. The retired `soul-workbench` and `soul-app-runtime`
packages are removed; v1 has no Soul-provided UI and no mounted-workbench
machinery.

`packages/core and packages/shared disappear` as broad buckets. Do not create
`core-v2`, `shared-v2`, or any replacement dumping ground.

`apps/api` migrated into `packages/worker-daemon`. The Phase 2 control plane lives
in `packages/host-control` with `apps/host-cli` and `apps/host-web` shells.

## Protocol Boundary

The Host/Soul boundary is descriptor-only. A Worker installs and runs a Soul from
`dist/soul.descriptor.json`. Host (Phase 2) and the Workbench must not read Soul
source, import Soul private modules, or interpret domain fields.

Descriptor v1 is intentionally minimal: `protocol`, `identity`, `engine` asset
refs and engine targets. It carries no workbench, no app-owned API, no
capabilities, and no domain business concepts.

The Worker owns and renders its Workbench directly. v1 has no micro-app, no
mounted-workbench resolution, and no Soul-provided UI. The session chat is
rendered by `apps/worker-web` from `packages/ui` primitives, driven by the local
broker API and the engine bridge event stream.

Host↔Worker integration is Phase 2 and is over-the-wire only, with zero code
intrusion in either direction:

- a sandboxed micro-app loaded over HTTP, where Host frames the Worker's own
  Workbench web — the Worker is unaware it is framed and keeps running standalone
  if Host is absent;
- the transport-agnostic control contract owned by
  `packages/worker-control-protocol`, where a Worker is the passive control
  server, Host is the client, and a Worker never initiates a connection to Host.

The control contract covers worker describe, health, instance lifecycle, and an
assignment envelope. It must not carry session, invocation, projection, engine,
or domain data. Neither integration channel is on the v1 runtime path.

## Runtime Boundary

Session lifecycle is separate from native engine execution. A session is a Worker
locator for a workspace and its invocation references; it carries no capability.
A session is, to the employee, a chat: a composer and a transcript over one
workspace. Engine execution lives in `engine_invocations` and is owned by the
Worker. The Worker, not Host, prepares engine invocation context and observes
native engine output.

Follow-up is session-level:

```text
POST /api/sessions/:sessionId/invocations
```

The engine target defaults to the Worker's detected default engine and may be
overridden per session. Native engine integration uses the B+ structured bridge:
per-engine adapters, process management, redacted raw chunks, normalized bridge
events, opaque external session refs, protocol-first cancel, reattach, and a
reconciler. The bridge does not own model calls, tool execution, approval flow,
sandbox policy, login state, engine profile state, or engine-native sessions.

## Freeform V1

`souls/aiworker-freeform` is the only strong v1 acceptance Soul. It proves the
standalone framework loop with Host absent: SDK authoring, descriptor build,
descriptor-only install, worker create bound to the Soul, workspace create, worker
config overlay, projection refresh, session create, first invocation, session
follow-up, cancel or completion, the worker-owned Workbench rendering the session
chat, and archive.

HR and QA remain first-party Soul identities, but they migrate after Freeform as
descriptor-producing templates and do not block the v1 framework loop.

## Destructive Migration Rules

This refactor is contract-first and runs in two phases.

Phase A (this contract flip): promote the canonical docs and doc gates to the
worker-owns-workbench, Soul-as-template, standalone-only v1 model; scrub every
old-model assertion (mounted workbench, Soul-provided UI, app-owned API, and the
capability layer) from the docs and doc gates; neutralize or `test.todo` the
behavioral guards that assert the reversed model; and record the implementation
teardown as tracked debt in docs/testing.md. The existing implementation is left
running so `release:check` stays green; canon describes the target and the code
follows in Phase B.

Phase B (implementation teardown): remove the capability layer, the mounted
micro-app and `/api/mount/workbench`, the `soul-workbench` and `soul-app-runtime`
packages, the Host chrome in `apps/worker-web`, and the retired descriptor
sections; collapse `appId`/`soulId` to a single Soul `id`; fold the session chat
into the worker-owned Workbench with a workspace tree and nested sessions; and add
worker-config overlay content editing. Each item is tracked in docs/testing.md.

Do not modify the new architecture to satisfy old E2E assumptions. Legacy
app-local adapter exports are removed, not migrated.
