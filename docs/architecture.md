# AIWorker Architecture

This document is the canonical architecture contract for AIWorker after the
destructive refactor. Older PMA notes, changelogs, historical audits, old local
skills, and temporary drafts are evidence only. They do not override this file.

## Position

AIWorker turns one expert's professional capability into many employees'
production capacity. A knowledgeable author packages that capability as a Soul,
iterates it quickly, and an organization uses Host to copy it at low cost to
employees who do not need to understand the technical system. Each employee gets
an out-of-the-box, dedicated AI Worker.

Soul is the capability carrier. Host is the iteration and replication lever.
Worker is the employee-side ready-to-use terminal.

AIWorker is therefore a worker-centric product. A Worker is an autonomous,
CLI-first runtime that runs one Soul through a native engine and owns engine
launch.

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

Host is an optional control plane for Soul release, distribution, permission
allocation, connector authorization, and Worker provisioning records. Host is
Phase 2 and is never on the runtime hot path. Host may run as its own installable
daemon so an administrator can install AIWorker Host and start the control plane
with one command, but that Host daemon owns only the control plane. Host does not spawn, observe, or
hold engine processes. Host is not a domain workflow layer, a product backend, an
agent runtime, a repository dashboard, a Soul configuration center, or a UI shell
around a Worker.

## Phase 2 Product MVP

The Phase 2 MVP is Soul distribution and employee Worker authorization:

```text
expert author -> published Soul version -> Host assignment -> employee Worker
```

The minimum useful loop is:

1. A capability author builds and publishes a Soul version.
2. An administrator assigns that Soul version to an employee or employee group.
3. Host records only distribution, authorization, connector, gateway/profile, and
   provisioning metadata.
4. Each employee receives or starts a dedicated Worker bound to the assigned Soul.
5. The employee opens the Worker's own Workbench and can start work without
   learning Souls, descriptors, MCP, engine targets, or Host.
6. The author can publish an updated Soul version, and the administrator can
   roll it out or roll it back across assigned employees.

The MVP user experience must prove three things:

- author experience: a professional capability can be packaged, published, and
  iterated without turning the Soul into an app or backend;
- administrator experience: one published capability can be copied to many
  employees with visible assignment, connector authorization, gateway/profile
  reference, Worker readiness, and rollout status;
- employee experience: the result feels like "my AI worker is ready", not like a
  technical deployment, Host dashboard, embedded page, or configuration chore.

Phase 2 must not use mount, mounted workbench, micro-app, iframe, or Host-rendered
Worker UI as product value. Host may help an employee reach the Worker's own URL,
but it must not wrap, embed, render, or reinterpret the Workbench. The product
value is capability replication, version rollout, permission governance, and
low-friction employee onboarding.

Phase 2.1 managed employee access uses Host as the enterprise URL and
authorization boundary for employees. Host-only applies only to managed employee remote access; it is not a Worker runtime dependency.

Managed employee access goes through:

```text
employee browser -> Host /workers/:workerId -> Logto -> assignment -> Worker-initiated tunnel -> Worker-owned Workbench
```

Worker Web and CLI remain locally operable without Host. Host or tunnel outage
makes managed remote access unavailable, but does not make the Worker runtime
unusable. Localhost Worker Web is diagnostic/local-only and must not be shown as
the employee-facing product URL.

## Decision Coverage Index

tmp/refactor decisions are evidence until promoted. Accepted refactor decisions
become active authority only when they are represented in the canonical docs,
guarded by tests, or both.

- docs/architecture.md owns the AIWorker product core, Phase 2 distribution MVP,
  worker autonomy, worker-owns-workbench, Soul-as-template, Host control-plane
  ownership, monorepo boundaries, data ownership, Freeform v1 scope, and
  destructive migration constraints.
- docs/protocol.md owns descriptor, broker route, configuration envelope, and the
  Phase 2 Host↔Worker control contract.
- docs/runtime.md owns projection, runtime assets CRUD, engine bridge, lifecycle, cleanup, and redaction contracts.
- docs/soul-authoring.md owns SDK authoring, convention discovery, build output,
  native MCP source layout, and Freeform source contract.
- docs/testing.md owns the coverage ledger, guardrail mapping, Phase 2 MVP
  experience acceptance, and historical implementation-teardown record.

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

- Soul release metadata: published versions, rollout state, and rollback records.
  Host owns a persisted Soul release registry: an administrator publishes a built
  Soul descriptor into the registry, where Host stores it as an opaque release
  artifact (the descriptor JSON plus derived `soulId`, `name`, `version`,
  `releaseRef`, and `source`). Host validates only the descriptor-only v1 shape on
  publish and never interprets domain fields. The assignable Soul list comes from
  this registry, not from a repo scan, so a published Host has a real catalog
  independent of any source checkout. The version is assigned at publish time
  (the descriptor itself carries no version), and `releaseRef` is `<soulId>@<version>`;
- distribution metadata: which employees or groups receive which Soul version;
- the worker registry: which employee Workers exist, identity, endpoint, health;
- assignment metadata: assigned Soul version, connectors, engine/gateway profile, permissions;
- permission allocation and connector authorization;
- worker distribution and provisioning records;
- Host service lifecycle metadata: daemon pid, API/Web endpoint, readiness, and
  redacted service logs.

Host must not own session, invocation, projection, engine processes, domain
state, or secrets. A Worker must not depend on Host to run. Worker packages must
not import Host packages — a runtime-direction rule retained because the Host
plane is a Phase 2 control plane and stays off the v1 Worker runtime hot path.

Current implementation note: the v1 standalone Worker and current Phase 2
bootstrap slice keep connector authorization, permission allocation,
gateway/profile sync, and rollout/rollback execution as deferred governance
work. The current Host assignment storage/API stores provisioning, readiness,
access, lifecycle, and Soul release identity only; it must not half-wire
governance payloads into the v1 Worker runtime or current assignment DB/API.

## Daemon Topology (daemon-per-worker)

A Worker daemon hosts at most one active Worker. In v1, the daemon remains
standalone and carries no fleet/Host runtime dependency: it serves its own CLI,
Workbench web, and configuration without needing Host. In Phase 2, Worker may
initiate provisioning check-in and Worker Access reverse tunnel connections to
Host as distribution-plane signals only. These Worker-initiated signals are not
runtime hot-path ownership.

The Phase 2 Host daemon is a separate control-plane service. It exists for the
npm/bun install experience and server lifecycle management: `aiworker-host start`
starts Host in the background, `aiworker-host daemon foreground` runs the same
service in the current process for supervisors, and `status`, `logs`, `stop`,
`restart`, and `clean` manage the same Host lifecycle state. This daemon does not
make Host a Worker runtime owner; it only serves Host API/Web and control-plane
metadata.

v1 scope: the standalone single-daemon path is the whole product — one daemon is
one Worker with its own CLI, Workbench web, and configuration. Phase 2 adds Host
as the organization-side distribution and governance plane. The Worker stays
pure: its binary and behavior do not change whether Host is present or absent,
and the `workerId` is the Worker's own minted identity, not a fleet-imposed
handle.

## Monorepo Boundary

The v1 top-level shape is:

```text
apps/
  worker-cli/
  worker-web/
  host-cli/      (Phase 2 control plane; off v1 Worker runtime hot path)
  host-web/      (Phase 2 control plane; off v1 Worker runtime hot path)

souls/
  aiworker-freeform/

packages/
  worker-runtime/
  worker-daemon/
  host-control/             (Phase 2 control plane; off v1 Worker runtime hot path)
  worker-control-protocol/  (Phase 2 control protocol; off v1 Worker runtime hot path)
  soul-descriptor/
  soul-sdk/
  cli-doctor/
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
import `host-*` packages. Freeform is the zero-config bootstrap default and the
strong v1 acceptance Soul; the first-party domain Souls (`google-ads`,
`hr-manager`, `product-manager`, `software-support`) ship as descriptor-producing
`souls/*` templates alongside it and are selectable at `worker create`.

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
refs and engine targets. `identity.description?` is optional display metadata,
not a capability, permission, API, or business workflow contract. The descriptor
carries no workbench, no app-owned API, no capabilities, and no domain business
concepts.

The Worker owns and renders its Workbench directly. v1 has no micro-app, no
mounted-workbench resolution, and no Soul-provided UI. The session chat is
rendered by `apps/worker-web` from `packages/ui` primitives, driven by the local
broker API and the engine bridge event stream.

Host↔Worker integration is Phase 2 and is over-the-wire only, with zero code
intrusion in either direction. Phase 2 Host integration has two
distribution-plane directions:

- Host initiates provisioning through aissh and owns assignment/readiness records.
- Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host.

The Provisioning Target Adapter is the Phase 2 Host-owned delivery boundary. Host
lists and validates provisioning targets; Worker only receives a provision token
and a callback URL it can reach.

The first adapter maturity levels are:

- aissh production: remote provisioning through verified `aissh exec [server_id] <command> --reason ...`.
- docker preview: clean container, isolated worker home / volume, release bundle verification.
- local dev: same-machine process with isolated `AIWORKER_HOME`.

These Worker-initiated signals are not runtime hot-path ownership. Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data. Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench.

The control contract covers worker describe, health, instance lifecycle, and an
assignment envelope. It must not carry session, invocation, projection, engine,
or domain data. The assignment envelope is the distribution record that lets Host
copy a published Soul version plus authorized connectors, permissions, and
gateway/profile refs to employee Workers. No Host control surface is on the v1
runtime path.

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

Selectability is broader than strong acceptance: public `worker create` may select
any first-party Soul — Freeform plus the `google-ads`, `hr-manager`,
`product-manager`, and `software-support` templates — and any expert-authored Soul
installed through `app install`. The `shipped` catalog view stays the zero-config
`aiworker start` bootstrap default; the `dev-sampling` view stays an internal
sampling alias. All first-party descriptors ship in the published CLI package.

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
