# AIWorker Architecture

This document is the canonical architecture contract for AIWorker after the
destructive refactor. Older PMA notes, changelogs, historical audits, old local
skills, and temporary drafts are evidence only. They do not override this file.

## Position

AIWorker is a CLI-first local product for running Soul Apps through native
engines.

Host is shell / locator / mount / bridge.

The default product path is:

```text
AIWorker -> Soul App -> workspace locator -> session -> app-owned work
```

Host starts local infrastructure, locates worker/workspace/session context,
mounts app-owned UI/API, prepares engine invocation context, and observes native
engine output. Host is not a domain workflow layer, a product backend, an agent
runtime, a repository dashboard, or a Soul App configuration center.

## Ownership

Soul Apps own domain state, domain UI/API, business outputs, confirmation
actions, app-owned history, standalone experience, and mounted product
experience.

Host owns only platform metadata:

- installed app descriptors;
- worker metadata and worker-scoped SDK-standard configuration envelopes;
- workspace locator metadata;
- session lifecycle metadata;
- engine invocation references;
- projection receipts;
- normalized bridge event references;
- redacted diagnostic references.

Host DB must not store Soul domain objects, artifact content, review/profile
records, business confirmation state, engine secrets, engine profile files, or
native MCP secret values.

## Monorepo Boundary

The target top-level shape is:

```text
apps/
  cli/
  web/

souls/
  aiworker-freeform/

packages/
  host-runtime/
  host-daemon/
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
product packages. For v1 strong acceptance, Freeform is the only shipped Soul;
retired HR/QA app-local source trees stay deleted until they are re-authored as
descriptor-producing `souls/*` packages. `packages/*` own reusable protocol,
runtime, daemon, storage, projection, engine bridge, SDK, workbench, filesystem,
and UI capabilities.

`packages/core and packages/shared disappear` as broad buckets. Do not create
`core-v2`, `shared-v2`, or any replacement dumping ground.

`apps/api` migrates to `packages/host-daemon`. A future `apps/daemon` may exist
only as a thin executable wrapper if a separate daemon binary becomes a product
target.

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
