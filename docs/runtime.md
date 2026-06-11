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

Phase 2 adds organization-side Soul distribution, but it does not add a Host
runtime chain. Host can publish and assign a Soul version, authorize connector
and gateway/profile refs, and track employee Worker readiness. The employee
still experiences a ready-to-use Worker with its own Workbench, workspace,
session chat, projection, engine bridge, lifecycle, and redaction.

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

The standalone entry is one zero-config command. That command now sits inside a
shared zero-config service startup contract for the public CLI commands that
start the service. `aiworker start` (the default command),
`aiworker daemon start`, `aiworker daemon restart`, and
`aiworker daemon foreground` are idempotent at the Worker readiness layer: each
ensures a single active Worker bound to the bundled official Freeform Soul exists
— installing the bundled descriptor and creating the Worker when none is present,
reusing the existing Worker otherwise — before starting or restarting the service.
The command differences are process shape only:
`aiworker start` runs the daemon in background, `aiworker daemon start` runs the
same service in background, and `aiworker daemon foreground` runs it in the
current process. None of the service-start commands opens a browser or Workbench
URL. Browser/Workbench launch belongs to `aiworker open`. The bootstrap
convenience lives in the CLI service-start commands. At the package layer, the daemon stays passive and never
auto-creates a Worker. `packages/worker-daemon` does not create Workers for
programmatic daemon bootstrap. To run a different Soul, install it and create the
Worker explicitly (`aiworker app install` then `aiworker worker create --app
<appId>`) before the service-start command reuses it. Public `worker create` lists
every first-party Soul plus installed apps; with no `--app` it opens an interactive
selector, while `--app <appId>` stays non-interactive for scripts and CI.

The Workbench web is the single active Worker's surface: it shows the bound Soul,
has no create-Worker or Soul-catalog UI, and its empty states are the first-run
experience — an empty Workbench prompts the employee to create the first workspace
by name; its root is derived under the Worker home
(`<worker-home>/workspaces/<workspaceId>`), not client-chosen. A workspace with no
session prompts to start the first session.
Auto-bootstrap stops at the Worker; the first workspace is the employee's
first action in the Workbench.

## Host Service Entry (Phase 2)

Host has its own service lifecycle because it is also a package-install target.
The administrator-facing product entry is `aiworker-host start`: it starts the
Host daemon in the background, writes Host lifecycle state, and prints the Host
URL. `aiworker-host daemon start` is the scriptable equivalent, while
`aiworker-host daemon foreground` runs the same Host API/Web service in the
current process for systemd, Docker, PM2, aissh foreground execution, and
debugging. `aiworker-host status`, `logs`, `stop`, `restart`, and `clean` manage
the same Host daemon lifecycle state.

This aligns Host and Worker at the service lifecycle layer, not the runtime
ownership layer. Worker daemon owns Worker runtime, Workbench, projection, engine
bridge, and native engine processes. Host daemon owns Host API/Web, assignment
and provisioning metadata, check-in/access/auth control-plane state, readiness,
and redacted logs.

In Phase 2, a Host-provisioned employee Worker keeps the same Workbench
experience. The first screen must read as "my AI worker is ready", not "Host
mounted a remote surface". Host assignment may preselect the bound Soul version,
authorized connector refs, permissions, and gateway/profile ref, but it must not
inject Host navigation, Host state, or Host workflow into the Worker's chat
surface.

## First-Provision Bootstrap (Phase 2)

Phase 2 distribution downfeeds the real Soul descriptor to the employee Worker and
bootstraps a ready-to-use Worker on a bare box with zero employee interaction. This
breaks the bootstrap circular dependency: the standalone daemon only checks in and
connects the tunnel when an active Worker already exists, but the Worker can only be
created from the Soul descriptor that the check-in itself returns. The provision CLI
command resolves this by doing the bootstrap in its own process before it starts the
daemon.

`aiworker provision --host <url> --token <provision-token>` on a fresh box, with no
pre-existing Worker, runs the first-provision bootstrap:

1. mint a Worker id and check in to Host once, consuming the single-use provision
   token;
2. receive the check-in response, which carries the assigned Soul descriptor as an
   opaque descriptor JSON, the access token, and assignment identity;
3. write the descriptor to `<worker-home>/soul.descriptor.json` and install it
   through the descriptor-path install (not inline), so the install carries engine
   asset refs;
4. enable the installed Soul so it is catalog-available, then create the Worker
   bound to the descriptor's `identity.id` — the Worker's lifelong Soul binding;
5. persist the access token to `<worker-home>/access-token` (mode `0600`);
6. register the Worker in the local fleet index, then start the daemon.

The daemon boot then resolves a single active Worker, reads the persisted access
token instead of checking in again, and connects the Worker Access tunnel. The
employee opens the Worker's own Workbench as a ready AI worker. Phase 2 downfeeds the
Soul and bootstraps the binding; LLM credential injection is Phase 3.

The Worker treats the descriptor as an opaque distribution artifact: it installs and
binds it without interpreting domain fields, consistent with the descriptor-only
Host/Soul boundary. The check-in returns the descriptor only when Host has a matching
Soul release; a missing release is an honest failure on the Host side, not a silent
empty Soul. A re-run of `provision` when a Worker already exists is idempotent: it
skips the bootstrap (the provision token is single-use and a second check-in would
fail) and starts the daemon, which self-heals from the persisted token.

## Restart Self-Heal (Phase 2)

A Phase 2 Worker reconnects its Worker Access tunnel across daemon restarts without
re-provisioning. The reconnect state lives in `<worker-home>/access-token`. On boot,
when a single active Worker and a persisted access token both exist, the daemon reads
the persisted token and connects the tunnel directly, skipping check-in. This is the
only restart-safe path because the provision token is single-use and a re-check-in
would fail with `401`.

The restart-state authority is local-first: the Worker DB is the only source of truth
for whether an active Worker exists, the persisted token-file is only the reconnect
credential, and the provision env is only the first-run signal. The Worker never
depends on Host to start its own runtime.

Two runtime failure branches degrade honestly rather than looping or crashing:

- Revocation: if Host rejects the access token (assignment revoked or denied), the
  tunnel closes with code `4401`. The Worker stops the reconnect loop, clears the
  persisted token so a later boot does not replay a dead token, and emits an
  actionable "re-provision is required" warning. It does not silently retry a dead
  token forever; ordinary transient disconnects (any other close code) still
  reconnect with exponential backoff.
- Consumed-token degrade: if first-provision crashes after the check-in consumed the
  token but before the Worker and token-file were committed, a later boot may carry an
  already-consumed token. The check-in then fails with `401`. The daemon catches this,
  keeps running in local mode, and emits an honest "provision may have been
  interrupted; re-provision is required" warning. It does not die or hang.

## Persistent Worker Access Token (Secret Boundary)

`<worker-home>/access-token` is the first `0600` secret file in the repository. It
holds the reconnect triple — the access token plus the assignment id and worker id
required by the Worker Access hello frame — so both the first-provision CLI and the
daemon boot read it back from the same worker-home path and skip a duplicate check-in.

This is a distinct trust domain from the "no literal secrets in DB, descriptor,
receipt, log, diagnostic, or UI" boundary. The persisted token is a local-only,
file-system `0600` capability token, not a provider secret:

- It is a capability token, not a provider/LLM secret. It authorizes this Worker to
  reconnect its own tunnel; it does not grant LLM access. Its blast radius is
  impersonating one already-provisioned Worker's reconnect, bounded by the access
  token's Host-side TTL and revocability.
- It is written with `writeFile(path, json, { mode: 0o600 })` plus a `chmod(0o600)`
  fallback because some platforms and umasks make the write mode unreliable. Windows
  `chmod` is a no-op; a headless Windows Worker is out of scope for v1 distribution
  and is declared so explicitly.
- The token has no provider-shaped prefix, so the engine-bridge shared secret
  alternation does not match it. Redaction for this token is field-level: a
  known-value `redactWorkerAccessToken` helper replaces the literal token before any
  text that might contain it is logged. The boundary is held primarily by never
  printing the token at all — the tunnel lifecycle, reconnect, and revocation logs
  record connection state only and carry no token value.
- The descriptor written next to it carries no secret; descriptor publish already
  asserts no literal secrets. The `<worker-home>/access-token` path is the single
  permitted at-rest location for the token; no other at-rest path (descriptor JSON,
  Worker DB, fleet index, logs, diagnostics) may hold it.

See the Phase 2 security boundary for the capability-token-versus-provider-secret
distinction.

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

### Session Auto-Naming

A session is auto-named on its first invocation, and only while its title is still
auto-assigned — never after the employee renames it. The Worker upgrades the title
in two steps: first an immediate placeholder derived from a truncated form of the
first prompt, then an engine-refined short title.

The engine refinement runs as an internal one-shot engine call. That call is a
fresh native session that is discarded: it is never resumed, its external session
ref is never written back into the session's resume chain, and its observations
never appear in the session transcript. It is recorded as an engine invocation
marked internal, so engine process state still lives in `engine_invocations`
(reconciler, cancel, lost still apply), but resume resolution and transcript
projection exclude internal invocations. A later real follow-up therefore always
resumes from the latest real invocation, never from the auto-naming call.

Engine refinement is best-effort: when the engine is unavailable, or the call
fails or times out, the placeholder title remains and no error surfaces to the
session. The generated title is redacted like any other persisted, displayed
value and must carry no secrets.

The Workbench transcript may render generic bridge observations as visible
timeline steps so the employee sees a coherent invocation flow rather than a
single disconnected loading placeholder. Optimistic startup skeletons are allowed
before the first real bridge event, but they must be visually or semantically
distinguishable from engine-derived steps and must not claim that tool/progress
work happened before a real event exists. Transcript timeline rendering must not
expose chain-of-thought, raw tool payloads, unredacted chunks, or secrets.

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

Native resume is per-engine. `claude-code` (`--resume <session_id>`) and `codex`
(`exec resume <thread_id>`) capture an opaque session ref on each invocation and
reconnect the native session on follow-up, so `supportsNativeResume` is true for
them and the missing-ref guard applies. Engines that do not capture a resumable
ref (`cursor`, `gemini`, `opencode`, `qwen`) report `supportsNativeResume` false
and are best-effort: their follow-ups run without native resume rather than
erroring, so a later turn may not carry prior native-session context until a
prompt-level history fallback is added.

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

## LLM Credential Injection (Phase 3)

Phase 3 lets the Host hand a Worker an LLM credential that the Worker injects into
the native engine's process environment as the executor's third env merge layer
(after `sanitizeEngineEnv()` and the per-engine static `env`). The carrier
variable names use the `ANTHROPIC_` / `OPENAI_` prefixes, which `sanitizeEngineEnv`
deliberately does not strip, so the injection survives. The credential arrives over
the already-authenticated Worker Access tunnel as the `credential_grant` typed
frame (see protocol) and lives only in the Worker's in-memory
`EngineCredentialStore` — never the descriptor, host.db, worker.db, the
`access-token` file, any log, diagnostic, or receipt.

Per-engine injection table (org-key v1):

| engineId      | provider    | injected env                                 | notes |
|---------------|-------------|----------------------------------------------|-------|
| `claude-code` | `anthropic` | `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`| injected in v1 |
| `codex`       | `openai`    | (none — documented-unsupported)              | see below |
| `cursor`      | —           | (none)                                       | excluded: its CLI does not route an externally supplied key |
| others (`gemini`/`opencode`/`qwen`/…) | — | (none) | not in the org-key v1 injection list |

`codex` is documented-unsupported in org-key v1. The codex CLI resolves auth
between a stored ChatGPT OAuth login (`auth.json` in `CODEX_HOME`) and an injected
`OPENAI_API_KEY` in a way that is not reliably controllable headlessly — codex's
own `doctor` flags the "stored ChatGPT tokens AND `OPENAI_API_KEY` present"
combination as ambiguous, and there is no non-interactive way to force the env key
(it requires an explicit `codex logout`). Injecting an org key codex might silently
ignore in favor of its OAuth would bypass the gateway and bill the wrong account.
Under that asymmetric downside the conservative, honest choice is to not inject
codex: a Worker running codex falls back to the user's own codex auth (degraded,
honest), never a silent wrong-account gateway bypass; the existing codex
auth-failure guidance already points an un-authed codex at `codex login` /
`aiworker config`. Re-enabling codex injection is gated on a reliable headless
force-API-key path or the slice-3 gateway adapter. Because `codex` is the sole
`openai` consumer, the v1 Worker eagerly acquires `anthropic` only; `openai`
remains in the protocol enum and Host broker for slice-3 symmetry but is not
pulled to Worker machines.

Naming: the frame carries `providerKind` (the LLM provider) and `gatewayUrl`, never
`engineKind`/`baseUrl` — the control protocol is transport-agnostic and Host/Soul
hold no Worker engine vocabulary (G4/G10). The Worker maps its own engineId to a
`providerKind` on its plane.

org-key deviation (Phase 3 v1, the only mode shipped). The org-key adapter delivers
the **org key as-is** — not a derived, per-worker, revocable, short-TTL key. The
org key therefore leaves the Host and reaches every employee machine, and the
native CLI persists it to its own credential store (e.g. `~/.claude/.credentials.json`,
`0600`). Blast radius: any compromised Worker compromises the whole org key,
affecting everyone, with no per-worker revocation — revocation means rotating the
org key for everyone. The broker's `revoke()` returns not-supported (it never fakes
success). This is a deliberate maturity boundary, not "derived"/"restricted"
language: true per-worker derivation, restriction, real revocation, and short TTL
are slice 3 (a self-issuing gateway adapter that plugs into the same broker
interface with zero protocol change). `expiresAt` is a far-future placeholder in
org-key mode, so liveness/revocation rides the 4401 access-token channel, not TTL
expiry; the far-future placeholder must never become the only liveness check.

The credential is in-memory only: `EngineCredentialStore.clear()` drops it on 4401
revocation and on process exit, so it does not survive a daemon lifecycle. The
store mint/grant path and the Host mint-error body never print the token; the
shared engine-bridge secret alternation redacts the `sk-ant-` org-key shape if an
engine echoes it to stdout/stderr. The Host plane cannot import the engine-bridge
redaction module (G2/G4 forbid host-* depending on the engine-launch package), so
the Host mint-error redactor is self-contained (mirroring the `soul-sdk` precedent)
and strips prefixed tokens plus any long opaque run; in practice mint errors carry
env-var names, not values.

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

Host→Worker assignment and lifecycle signals are Phase 2 distribution inputs. In
v1 the Worker runs standalone and no Host signal affects its runtime execution.
Phase 2 Host integration has two distribution-plane directions:

- Host initiates provisioning through aissh and owns assignment/readiness records.
- Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host.

Host URLs are environment-specific:

- `hostBrowserBaseUrl` generates `/host` and `/workers/:workerId`.
- `hostControlBaseUrl` is the Host API URL.
- `adapterRuntimeControlBaseUrl` is the URL reachable from the Worker runtime environment.

A remote aissh target must not use localhost, 127.0.0.1, or ::1 as its adapter runtime callback URL.

Phase 2 provisioning check-in and Worker Access tunnel signals are distribution-plane signals.
These Worker-initiated signals are not runtime hot-path ownership. Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data. Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench.

Phase 2.1 tunnel signals are distribution-plane signals. Host or tunnel outage makes managed remote access unavailable, but does not make the Worker runtime unusable.
The standalone Worker path and localhost Worker Web remain valid local operator
and break-glass paths.

In Phase 2, assignment changes may update Worker-scoped authorization and
selection metadata at explicit sync points, but they must not expose session
content to Host, interrupt native engine execution, replace projection ownership,
or make the Worker depend on Host for normal work.

Session and invocation context files under `.aiworker/sessions/*` are cleaned only when the physical workspace root is deleted; session lifecycle delete intentionally preserves them.
