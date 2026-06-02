# AIWorker Runtime

This document defines canonical runtime behavior.

## Runtime Chains

The runtime is six chains:

1. Soul authoring and descriptor build.
2. Descriptor install and worker enablement.
3. Session start and first invocation.
4. Runtime skills, MCP, and entry-file CRUD.
5. Worker-owned Workbench: workspace and session chat.
6. Archive and delete.

## Local Daemon

`packages/worker-daemon` owns the local broker API used by the Worker CLI and the
Worker Workbench web. It forwards orchestration to `packages/worker-runtime`.

The daemon is not a product backend and does not own domain routes.

A daemon reconstitutes at most one active Worker at bootstrap; finding more than
one active Worker is a violation and the daemon refuses to boot (fail-fast).
Archived Workers are not reconstituted eagerly; their runtime is rebuilt on
demand. A standalone CLI or Workbench client may omit `workerId` on list routes;
the unscoped result on a single-active daemon is that active Worker's, so the
standalone path never depends on Host or fleet context.

## Standalone Entry

The standalone entry is one zero-config command. `aiworker start` (the default
command) is idempotent: it ensures a single active Worker bound to the bundled
official Freeform Soul exists — installing the bundled descriptor and creating the
Worker when none is present, reusing the existing Worker otherwise — then starts
the daemon, serves the Workbench web, and opens the local Workbench URL. The
bootstrap convenience lives in the CLI; the daemon stays passive and never
auto-creates a Worker. To run a different Soul, install it and create the Worker
explicitly (`aiworker app install` then `aiworker worker create --soul <id>`)
before `aiworker start` reuses it.

The Workbench web is the single active Worker's surface: it shows the bound Soul,
has no create-Worker or Soul-catalog UI, and its empty states are the first-run
experience — an empty Workbench prompts the employee to create the first workspace
by name; its root is derived under the Worker home
(`<worker-home>/workspaces/<workspaceId>`), not client-chosen. A workspace with no
session prompts to start the first session.
Auto-bootstrap stops at the Worker; the first workspace is the employee's
first action in the Workbench.

## Session And Invocation State

session lifecycle: active | archived | deleted

`deleted` is a reserved terminal enum value; v1 has no soft-delete producer — no code path sets session status to `deleted`. `archived` is the only soft lifecycle transition. Session DELETE (`DELETE /api/sessions/:sessionId`) is a hard delete that physically removes the session row; it does not set status to `deleted`.

Session lifecycle describes whether the locator remains available in AIWorker.
It does not describe engine execution.

A session is a chat over one workspace: a composer and a transcript. It records no
capability. A session is created under a workspace with no capability or other
input; it is auto-named and renamable, opens an empty chat, and its first composer
message becomes the session's first invocation. The engine target defaults to the
Worker's detected default engine and may be overridden per session.

Historical SQLite column names may remain only
behind the storage boundary while migrations are collapsed.

execution/process state belongs to engine_invocations

Engine invocation status:

```text
queued
starting
running
succeeded
failed
cancelled
lost
```

Engine process state:

```text
not_spawned
spawned
exited
killed
lost
```

Follow-up is session-level:

```text
POST /api/sessions/:sessionId/invocations
```

Follow-up uses the same worker, workspace locator, AIWorker session, and engine
target. Native resume uses the latest opaque external session ref when the
adapter supports it. The bridge must not silently create a fresh native session
when resume data is missing.

## Engine Bridge

AIWorker uses B+ structured native engine bridge.

`packages/engine-bridge` owns:

- adapter registry;
- discover/start/follow-up/cancel contract;
- process manager;
- raw chunk redaction;
- normalized bridge event pipeline;
- event stream reattach;
- reconciler;
- opaque external session refs.

Concrete per-engine adapters (Codex, Claude Code) are provided by
`packages/worker-runtime` and registered into the bridge registry.

Native engines own:

- model calls;
- tool loops;
- approval flow;
- sandbox behavior;
- authentication;
- profile state;
- native plugins;
- native session internals.

Bridge events are generic observations. They must not encode Soul domain verdicts
such as review approved, release failed, candidate created, artifact accepted, or
business confirmed.

Failure codes are platform-level and stable enough for tests and diagnostics.
Required codes include `ENGINE_SESSION_REF_MISSING`, `ENGINE_CANCEL_FAILED`,
`PROJECTION_RECEIPT_MISSING`, `PROJECTION_RECEIPT_STALE`,
`WORKSPACE_LOCATOR_MISSING`, `WORKSPACE_ROOT_MISSING`, and
`BRIDGE_REDACTION_FAILED`.

Allowed bridge event classes are generic invocation and process observations:

```text
invocation.started
invocation.progress
invocation.output.delta
invocation.output.snapshot
invocation.tool.observed
invocation.usage.observed
invocation.warning
invocation.error
invocation.completed
invocation.cancelled
process.started
process.exited
process.lost
```

Cancel targets an invocation id. The bridge sends adapter-level protocol cancel
when supported, then soft interrupt, then process-group termination after the
grace period. Delayed hard kill must never terminate a newer invocation.

## Accepted Execution-Mode Deviation

The canonical contract is that native engines own model calls and AIWorker does
not manage engine login. Local execution has two modes. `local-cli` spawns the
selected native engine CLI and is fully aligned with this contract.

`byok` is an accepted P2 deviation, not P0/P1 drift. When no native engine CLI is
installed, `byok` is the fallback execution mode and `packages/worker-runtime`
issues an OpenAI-compatible `chat/completions` request directly so a Worker
without a native engine can still run. This is a worker-internal non-native-engine
fallback, not a Host-owned model call: it deviates from native-engine model-call
ownership and is recorded here so the deviation is explicit rather
than silent default behavior.

The secret boundary is preserved. `byok` stores only an `apiKeyRef` such as
`env:OPENAI_API_KEY`; literal API keys are rejected at the settings layer; the
resolved key is read from the environment at call time and is never persisted to
DB, projection receipts, logs, diagnostics, OpenAPI examples, or UI.

The ownership-safe resolution is to re-home `byok` behind an engine-bridge
adapter or to remove it. Neither is required for the current release. This
deviation must not be cited to justify any Host-owned model call or any engine-secret persistence on either plane.

## Projection

Worker orchestrates projection; engine-projection executes projection; SDK and protocol define projection inputs.

`packages/engine-projection` materializes engine-facing files from descriptor
asset refs and worker-scoped configuration overlays. Worker runtime calls it
because the Worker owns workspace locator, session, selected engine, worker
configuration, and filesystem root facts. Host does not define skill format, MCP
semantics, or domain files.

Projection owns:

- workspace assets;
- skills;
- native MCP files;
- entry files;
- projection receipts;
- receipt-based cleanup.

Projection cleanup removes receipt-owned files only. Workspace business files
remain Soul/user-owned.

## Runtime skills, MCP, and entry-file CRUD

Runtime skills, MCP, and entry-file CRUD is a first-class runtime chain.

- The Worker CLI or the Worker Workbench web requests an SDK-standard worker
  configuration action.
- The Worker validates and stores worker-scoped overlay records.
- Worker-scoped overlay records live in Worker metadata; projected file contents do not.
- `engine-projection` materializes descriptor assets plus overlays for one
  selected engine target.
- Projection writes a receipt for cleanup, freshness, and diagnostics.

Workspace assets are single-source. Skills are single-source by default with
explicit engine override only when necessary. MCP uses one native file per
engine target, such as Codex `config.toml` and Claude Code `.mcp.json`.

## Secrets And Redaction

AIWorker does not manage engine login, token refresh, account selection, or
engine profiles.

Author-owned native MCP files may contain literal secrets. AIWorker must not copy
those values into descriptors, DB, projection receipts, logs, diagnostics,
OpenAPI examples, or UI. Anything emitted by CLI, Web, logs, API errors, event
streams, or diagnostics must be redacted before persistence or display.

## Lifecycle

Archive is the default lifecycle operation for workers, workspace locators, and
sessions. Hard delete is explicit and removes Worker metadata plus receipt-owned
projection files only. Physical workspace root deletion is a separate dangerous
action and is not the default lifecycle behavior.

Host→Worker assignment and lifecycle signals are Phase 2. In v1 the Worker runs
standalone and no Host signal affects its runtime execution.

Session and invocation context files under `.aiworker/sessions/*` are cleaned only when the physical workspace root is deleted; session lifecycle delete intentionally preserves them.
