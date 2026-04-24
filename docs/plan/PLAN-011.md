# PLAN-011 CLI-first lightweight runtime (core extraction + aiw / aim / gateway)

- **status**: completed (phase 1a)
- **createdAt**: 2026-04-24 11:40
- **approvedAt**: 2026-04-24 11:55
- **completedAt**: 2026-04-24 12:30
- **relatedTask**: REFACTOR-003
- **followUp**: PLAN-012 (phase 1b core extraction)

## Context

### C1 — Current weight inventory

`apps/api/src` totals ~19 kLOC TypeScript across 107 files, split into:

| Slice | Files | LOC | Role |
|-------|-------|-----|------|
| `modes/worker.ts` + `modes/dashboard.ts` | 2 | 302 | Per-mode bootstrap, route mount, hot-reload plumbing |
| `worker/` | 107 | ~15,075 | Orchestrator, channels, executor engines, brain, evolution, bootstrap, secrets, workspaces |
| `dashboard/` | 17 | ~4,033 | Registry, supervisor (docker), auth middleware, poller |
| `shared/` | 5 | 97 | Request logger + error handler only |

Frontend `apps/web/src` is ~6.8 kLOC / 51 files; four routed pages (`workers.index`, `workers.$workerId`, root) + shadcn components. `packages/shared` is ~1.4 kLOC of types/constants.

**Transport inventory** today: all control-plane + data-plane paths are HTTP REST + SSE. `apps/api/src/modes/worker.ts:114-157` mounts five Hono route builders; `apps/api/src/modes/dashboard.ts:54-59` mounts one. No WebSocket, no CLI, no IPC — the only entry point is `bun src/index.ts` dispatching on `AIWORKER_MODE`.

**CLI gap**: zero existing CLI infrastructure. No `bin/` directory, no `"bin"` field in any `package.json`, no `commander` / `cac` / `yargs` dependency, no argv parser in `apps/api/src/`.

### C2 — Where the "heaviness" actually sits

The architecture is not monolithic; the weight is concentrated in six seams that a CLI-first redesign has to either keep, slim, or relocate:

1. **Dual SQLite + migrations** (`db/fleet/` + `db/worker/`). Two drizzle configs (`drizzle.fleet.config.ts`, `drizzle.worker.config.ts`) with 12-field + 10-table schemas respectively. CLI-first does not remove this — `aiw` still needs `worker.db` for transcripts + secrets, `aim` still needs `fleet.db` for worker registry. But schema access must become transport-agnostic (today the SQL driver is reached straight from route handlers via module-level singletons).
2. **AES-256-GCM vault + bootstrap ceremony** (`worker/secrets/`, `worker/bootstrap/identity.ts`). Per-worker master key seeds a `SecretsVault`; on first boot `loadOrMintIdentity` mints id + bearer token and prints it once to stdout so the operator can paste it into `aim register`. This flow maps cleanly to a CLI: `aiw init` becomes the bootstrap command, `aim pair` reads the printed line.
3. **Hot-reload runtime** (`apps/api/src/modes/worker.ts:93-112` — `reloadRuntime`). Routes capture `() => state.runtime` closures so `PUT /api/worker/config` can swap the runtime atomically. This contract (`runtime.dispose()` + fresh build + in-place ref swap) has to survive the migration; CLI REPL sessions also want hot-reload so `aiw config set ...` in one terminal is seen by an in-flight REPL in another.
4. **Dashboard → worker proxy** (`dashboard/registry/routes.ts`, the `ALL /api/workers/:id/proxy/worker/*` mount). Hop-by-hop header stripping + audit events. Over WebSocket this becomes method dispatch instead of raw HTTP forwarding — simpler in some ways (no hop-by-hop glue), new in others (per-request stream multiplexing).
5. **ProcessManager + WorkspaceManager** (`worker/orchestrator/process-manager.ts`). FEAT-015 made these survive `reloadRuntime`; they own per-engine concurrency limits, stall/kill timeouts, GC, and workspace lifecycle. They are transport-agnostic already — the CLI extract is pure file moves, not redesign.
6. **Multi-engine executor registry** (`worker/executor/engines/{claude-code,codex,cursor,acp}/`, 34 files). PLAN-007's investment. `EngineKind` is the switch point; engines emit engine-agnostic `AgentEvent`s. Moving this into `packages/core` is file-level refactor; no design change.

### C3 — Hermes reference (what we borrow)

Hermes' design that maps directly onto our constraints:

- **Single conversation loop, multiple entry points**: `cli.py` and `gateway/run.py` both call `AIAgent.run_conversation()`. Our equivalent must be a `packages/core` function that takes an executor + brain + message stream, independent of Hono / WebSocket / stdin. This is the cornerstone of the refactor.
- **Filesystem-as-source-of-truth for skills**: `~/.hermes/skills/` holds bundled + hub-installed + agent-created skills. We already have `HERMES_HOME` referenced by the Hermes brain provider (`worker/brain/providers/hermes.ts`) but the worker treats skill bindings via `skillBindings` table rather than filesystem. Keep current behaviour — changing skill storage is out of scope for this refactor.
- **Skill → slash command auto-registration**: every installed skill becomes `/skill-name` in both CLI and gateway surfaces. Useful later for `aiw run`; not in scope for phase 1.
- **Single-command install**: `curl ... | bash` installs Python + deps + Hermes. Our binary distribution via `bun build --compile` achieves the same with no runtime install.

What we do **not** copy: Hermes' Python-first stack, `~/.hermes/config.yaml` single-file config (we have structured `worker_config` with version-stamped hot-reload), OpenAI-compatible auto-detection across 19 providers (too broad for our scope).

### C4 — OpenClaw reference (what we borrow)

OpenClaw's gateway + protocol design is the most direct fit for what the user asked for:

- **Single long-lived gateway on `127.0.0.1:<port>` over WebSocket**, text frames with JSON payloads. First frame must be `connect` with a declared role (`operator` or `node`) and a device identity. Non-local connects require explicit approval; loopback auto-approved.
- **Operator vs Node split**: operators are CLI + Mac app + Web UI (one WS connection each, send requests / subscribe events). Nodes are worker runtimes (declare `caps`/`commands`/`permissions`). Our `aiw` instance = node, `aim` CLI + web UI = operators.
- **Control plane vs data plane on same WS**. Control = `health`, `status`, `agent`, `system-presence`. Data = `chat.send` returns non-blocking ACK; results stream via events. Matches our need to turn orchestrator submit + SSE into one WS channel.
- **Remote access**: Tailscale or SSH tunnel (`ssh -N -L 18789:127.0.0.1:18789`), TLS + optional pinning. Same handshake + token apply over tunnel. This is already how our production deploy works behind Caddy + Cloudflare — swapping the transport doesn't change ops.
- **RFC 42026 split**: monolithic `openclaw gateway` → `openclaw-gateway` (control plane) + `openclaw-runtime` (per-agent process) with `embedded` / `local-split` / `distributed` deployment modes. **Our current dashboard/worker split is already the `distributed` shape.** The refactor is less about reshaping topology and more about (a) swapping transport HTTP → WS for the control plane, and (b) making worker runnable without HTTP at all (CLI REPL).

What we do **not** copy: full TypeBox schema validation (we stick with Zod), Docker sandbox socket-proxy (already addressed by `MANAGER_CAN_LAUNCH` + compose overlay), TUI-specific frames (our CLI is line-based first).

### C5 — Non-negotiable invariants (from CLAUDE.md §"Architecture Constraints")

Any plan must preserve:

- **Dual-mode single image** — one binary dispatches to aiw / aim / gateway roles by flag or subcommand. Keep worker and dashboard semantics distinct; do **not** merge state.
- **Data-domain boundary** — `fleet.db` holds only pointers + audit; `worker.db` holds business data. No cross-writes.
- **Worker identity + config singletons** — `worker_identity.pk='default'`, `worker_config.pk='default'`, `If-Match: <version>` optimistic lock on config update, `reloadRuntime` serialised.
- **Provider extension contract** — new brain/executor/channel implements an interface and registers in a factory switch; no provider-specific branches in orchestrator core.
- **Hot-reload correctness** — route closures take `() => state.runtime`; old runtime's `dispose()` must unhook observer + proposer + long connections.
- **Hop-by-hop header handling on proxy** — applies to the WS `proxy` equivalent too; we should not leak operator `Authorization` to nodes. Worker side still uses bearer + `timingSafeEqualStrings`.
- **Crypto boundary duplication** — `dashboard/registry/crypto.ts` vs `worker/secrets/vault.ts` stays deliberately duplicated. Do not cross-link during the refactor.
- **Channel webhook signature verification** — survives regardless of CLI reshape.
- **Evolution observer off the hot path** — persisted by bus listener, proposer runs on interval. Must not enter orchestrator request path.

### C6 — Bun-compile viability (blocking unknown)

Bun compile targets ship everything in one binary, but native SQLite driver behaviour has to be confirmed. Current stack uses `bun:sqlite` (Bun's built-in) rather than `better-sqlite3`, which is compile-compatible — this is a positive signal. Still must verify:

- `bun:sqlite` embedding works under `bun build --compile --target bun-linux-x64`.
- Drizzle's migration runner (`runFleetMigrations`, `runWorkerMigrations`) reads SQL from the `drizzle/` folder — needs either asset embedding via `--asset` or a boot-time extraction from embedded migration resources.
- `@hono/zod-openapi` and `@scalar/hono-api-reference` (+ ~80 KB of Scalar bundle) bundle cleanly.
- Production deploy currently goes via GHCR image; CI build matrix doesn't currently produce raw binaries. CI cost of adding a compile step + multi-arch artefact publishing (linux-x64, linux-arm64, darwin-arm64) is bounded but non-zero.

Outcome of this check gates the binary-distribution aspect of the plan. Failure mode: fall back to shipping the compiled binary inside the existing OCI image and having `aiw` / `aim` invoke `bun dist/aiw.js`.

### C7 — Existing test surface

Graph stats report 656 Test nodes and 4256 TESTED_BY edges across the repo. Relevant clusters:

- `apps/api/src/worker/executor/engines/**/*.test.ts` — engine-level unit tests.
- `apps/api/src/worker/channels/adapters/*.test.ts` — channel signature + envelope tests.
- `apps/api/src/dashboard/registry/*.test.ts` — registry CRUD.
- `apps/api/src/worker/secrets/*.test.ts` — vault round-trips.
- `apps/api/scripts/smoke-plan-004.ts` — end-to-end smoke validated in PLAN-004.

Any file move inside `apps/api/src/worker/` has to preserve the test harness (bun test uses same-directory colocation). A package extraction (`apps/api/src/worker/` → `packages/core/`) will either move tests with sources or introduce test-path aliases; cheapest is the former.

## Proposal

Five-phase migration with explicit gate after each. Only phase 1 is asking for approval in this plan — subsequent phases will get their own PLANs as scope solidifies.

### Phase 1 — Core extraction (this plan's committed scope)

**Goal**: the conversation loop + orchestrator + provider contracts are extractable into `packages/core` and run in-process without a Hono server. An `aiw run` one-shot REPL proves it.

**Workstreams**:

#### P1.1 Package skeleton

- `packages/core/`
  - `src/` layout mirrors the slice under `apps/api/src/worker/`: `brain/`, `executor/`, `orchestrator/`, `channels/`, `evolution/`, `events/`, `config/`, `secrets/`, `workspaces/`, `bootstrap/`.
  - `package.json` name `@aiworker/core`, depends on `@aiworker/shared`, `drizzle-orm`, `zod`, `consola`. **Does not** depend on `hono` — any Hono type that leaked into core interfaces (e.g. handler signatures) becomes a plain function on its own contract.
  - `src/index.ts` exports two top-level builders: `buildWorkerRuntime(workerId, config, deps)` (already exists; just relocated) and `buildOrchestrator(runtime)` (thin factory over `OrchestratorDeps`).
- `packages/storage-sqlite/`
  - Holds current `db/worker/` and `db/fleet/` drizzle schemas + migrations, plus initialiser functions `initWorkerDb`, `initFleetDb`, `runWorkerMigrations`, `runFleetMigrations`.
  - Exposes typed repositories (`WorkerIdentityRepo`, `WorkerConfigRepo`, `WorkerSecretsRepo`, `RegisteredWorkersRepo`, ...) so consumers in core / cli / api don't reach into the drizzle client directly.

#### P1.2 Decouple Hono from core

Audit for Hono leaks in `apps/api/src/worker/**`:

- Route builders (`buildChannelRoutes`, `buildEventRoutes`, `buildManagementRoutes`, `buildOrchestratorRoutes`, `evolutionRoutes`) stay in `apps/api/src/` because they are transport adapters. They import `buildWorkerRuntime` from `@aiworker/core` via the hot-reload closure pattern.
- `WorkerEventBus` + `eventBus` — pure EventEmitter-style class, no HTTP awareness. Move as-is to core.
- SSE response shaping lives in `worker/events/routes.ts` — stays in api.
- Channel adapters (`telegram`, `whatsapp`, `lark`, `line`, `web`) are Hono-agnostic at the adapter level; only `routes.ts` binds Hono. Move adapters + registry + envelope into core; leave `routes.ts` in api.

#### P1.3 `aiw` skeleton

- `apps/cli/`
  - `package.json` name `@aiworker/cli`, `bin: { aiw: "./dist/aiw.js", aim: "./dist/aim.js" }`.
  - `src/aiw.ts` entry, argv parsing via `cac` (~15 kB, zero deps, matches Bun's philosophy). Pick `cac` over `commander` for the TypeScript-friendlier types and smaller surface.
  - Initial subcommand surface (phase 1 scope):
    - `aiw init` — mint identity + seed default config, behaves exactly like current worker bootstrap but exits after printing.
    - `aiw run [--message <text>] [--session <id>]` — one-shot: load config, hydrate secrets, build runtime, feed one user message into orchestrator, stream events to stdout, exit. **No HTTP bound**. This is the phase-1 success demo.
    - `aiw serve [--port <p>]` — bit-for-bit current `AIWORKER_MODE=worker` HTTP server, just re-packaged behind a subcommand.
    - `aiw config show` / `aiw config set <path> <value>` — read/write via existing `loadOrSeedConfig` + `putConfig` with the `If-Match` guard.
    - `aiw token rotate` — wraps `rotateToken` from management.
- Build: `bun build src/aiw.ts --compile --outfile dist/aiw` targets one binary per OS/arch when Phase 2 closes.

#### P1.4 Verify invariants hold

- Hot-reload invariant (`CLAUDE.md` §"Hot-reload 写法"): `aiw run` does not need reload because it exits — but the contract is that `reloadRuntime` still works in `aiw serve`. Add a test that invokes serve, hits PUT /api/worker/config, and asserts the next request sees the new runtime. (May already exist under `apps/api/src/worker/management/routes.test.ts`; verify and extend if needed.)
- Data-domain boundary: lint rule or import guard ensures `@aiworker/core` never imports from `apps/api/src/dashboard/**`. Today the separation is de facto via directory naming; an explicit ESLint rule (`no-restricted-imports`) makes it enforceable.
- No Hono in core: typecheck succeeds with `hono` removed from `@aiworker/core`'s `package.json`.

#### P1.5 Smoke + E2E

- `apps/api/scripts/smoke-plan-004.ts` keeps passing end-to-end (registers a worker, ingests a message, streams events, cancels task).
- **New smoke** `apps/cli/scripts/smoke-aiw-run.ts`: `aiw init` → `aiw run --message "hello"` → assert final event is `orchestrator.task.succeeded` or `.failed` (executor may be scripted in test mode).
- `bun run check` clean.
- Deployment path untouched — still `docker compose pull` of the same image. The image's `CMD` changes from `bun src/index.ts` to `aiw serve` (or `aim gateway`) once phase 2 binaries exist; phase 1 keeps the current CMD, the `aiw` binary is additive.

**Phase 1 exit criteria**:

1. `@aiworker/core` + `@aiworker/storage-sqlite` published in workspace; `apps/api` imports from them.
2. `aiw init` + `aiw run` + `aiw serve` subcommands work; `aiw run` demonstrates zero-HTTP mode.
3. All existing tests + new smoke pass.
4. No change in runtime behaviour of the deployed dashboard or worker images.

**Phase 1 budget**: 5–7 working days for a solo stream; ~3 days if split BKD-style across core extract / cli skeleton / test migration.

### Phase 2 — `aim` + gateway MVP (separate plan)

Out of scope for PLAN-011 approval. Captured here for continuity:

- Replace HTTP proxy (`dashboard/registry/routes.ts ALL /api/workers/:id/proxy/worker/*`) with a WS gateway on `127.0.0.1:<port>` that accepts operator + node connections.
- `aim pair <workerId> <url>` replaces the current paste-token flow with a challenge-response handshake (device identity borrowed from the OpenClaw pairing model, simplified — no mobile nodes).
- `aim workers list / info / start / stop / proxy` over the WS protocol.
- `aim gateway start` daemonises the gateway (systemd-friendly) or forks as a child process.
- Backward compatibility: keep the existing HTTP dashboard REST until phase 4.

### Phase 3 — Worker side gateway attach (separate plan)

- `aiw serve --gateway ws://127.0.0.1:<port>` keeps HTTP up *and* opens a WS connection to the gateway as a `node`.
- Over that WS the node relays inbound envelopes, receives management commands, streams events.
- Crucially: the HTTP surface stays valid. Nodes are optional gateway participants, not exclusive.

### Phase 4 — Web UI migration (separate plan)

- `apps/web` switches its fetch layer to the gateway WS protocol (or keeps REST against the gateway's REST-compat facade, TBD).
- Existing pages rewired; no UX redesign.
- Deprecate `AIWORKER_MODE=dashboard` HTTP surface behind a flag; final removal in phase 5.

### Phase 5 — Cleanup (separate plan)

- Delete the old dashboard HTTP app; `AIWORKER_MODE=dashboard` becomes a compatibility shim that spawns the gateway.
- Publish compiled binaries (`aiw` / `aim` / `aim-gateway`) as GitHub release artefacts alongside the GHCR image.
- Update deployment runbook in `docs/deployment.md`.

## Risks

### R1 — Hot-reload regression while splitting packages (P1)

Moving `worker/runtime.ts` into `packages/core` while keeping route closures pointing at `() => state.runtime` is mechanically simple, but any accidental capture of the old runtime reference inside a package-internal factory (e.g. an evolution observer that grabs `runtime.brain` eagerly) will silently break hot-reload. Mitigation: add a reload regression test before the move, audit every `new X(runtime)` for identity capture.

### R2 — Bun-compile gaps (P1)

If `bun build --compile` can't embed `bun:sqlite` + drizzle migrations cleanly, phase 2 binary distribution slips. Mitigation: spike before phase 1 closes. Fallback: ship `aiw` as a Bun script inside the existing OCI image, drop the standalone-binary narrative.

### R3 — Broken CI / smoke coverage (P1)

Package moves + new lint guards will shake out latent import cycles or hidden type exports. Mitigation: phase 1 explicitly requires `bun run check` + smoke green; no scope creep during the move.

### R4 — Future work written against old seams (P2)

While the CLI work is in flight, other branches may land against the old seams (e.g. a new channel adapter wired directly into `apps/api/src/worker/channels/`). Mitigation: land phase 1 fast (1 sprint), freeze structural changes in `apps/api/src/worker/**` during the core extract window.

### R5 — Scope drift from "lightweight" (P2)

"Lightweight" is a feel, not a metric. Without explicit LOC / dependency budgets the refactor can add packages without shrinking the runtime. Mitigation: phase 1 must not increase total repo LOC by more than 5% (moves + a few glue files only). Each subsequent phase states a LOC / dependency target before approval.

### R6 — OpenClaw's device-pairing surface is too rich (P2)

OpenClaw's pairing flow (cryptographic challenge + device token + admin approval + allowlists + Docker sandboxing per session) is powerful and too much for our first gateway. Mitigation: phase-2 pairing is a thin version — shared secret (existing `INTERNAL_SHARED_SECRET`) + loopback auto-approval, upgrade to per-device identities only if multi-operator lands.

### R7 — Channel + engine code size inflation (P3)

Moving 34 executor engine files + 6 channel adapters into core is pure file churn, but each becomes importable from places that currently can't reach them, creating new coupling opportunities. Mitigation: keep `channels/` and `executor/engines/` as sub-packages exported only via the core's public surface; no deep imports from apps.

### R8 — Tooling integration (P3)

`drizzle-kit generate` reads configs at `apps/api/drizzle.*.config.ts`. After moving schemas into `packages/storage-sqlite`, those configs move too; `bun run db:generate` script in `apps/api/package.json` needs redirection or replacement. Mitigation: update the root `package.json` scripts to call through `bun --filter @aiworker/storage-sqlite run generate`.

## Scope

### In scope (phase 1 — this plan)

- New workspace packages: `packages/core`, `packages/storage-sqlite`.
- New workspace app: `apps/cli` exposing `aiw` binary with subcommands `init`, `run`, `serve`, `config show|set`, `token rotate`.
- Refactor `apps/api/src/worker/**` → move transport-agnostic code to `packages/core`; keep Hono route builders in `apps/api/src/`.
- Refactor `apps/api/src/db/**` → `packages/storage-sqlite`; update drizzle configs + migration scripts; update `apps/api/package.json` scripts.
- ESLint rule (`no-restricted-imports`) enforcing: `@aiworker/core` ≠ imports from `apps/**` or from `dashboard/**`.
- Tests: regression for hot-reload, new `aiw run` smoke, keep all existing tests green.
- Docs: update `docs/architecture.md` §"Layered Responsibilities" to reflect core/storage/transport split; add `docs/cli.md` with the phase-1 subcommand reference.
- Changelog entry on completion.

### Out of scope (deferred to later plans)

- WebSocket gateway (`aim gateway`) — PLAN-012.
- `aim` CLI beyond a placeholder stub — PLAN-012.
- Worker node attach to gateway (`aiw serve --gateway`) — PLAN-013.
- Web UI migration — PLAN-014.
- Binary distribution pipeline (CI publishing to GitHub releases) — PLAN-015.
- Removal of dashboard REST — PLAN-016.
- Hermes-style filesystem-first skill storage — not planned (existing `skillBindings` table keeps current semantics).
- New channel adapters or new executor engines during the move.

### Files touched (phase 1, high-level count)

- Created: ~3 package skeletons + ~10 glue files + ~1 CLI entry + 1 smoke script + 1 ESLint config edit. ≤ 20 net new files.
- Moved: ~107 files from `apps/api/src/worker/` into `packages/core/src/`; ~10 files from `apps/api/src/db/` into `packages/storage-sqlite/src/`. Mechanical.
- Edited: `apps/api/src/modes/worker.ts`, `apps/api/src/modes/dashboard.ts`, `apps/api/package.json`, root `package.json` (workspace registration), `docs/architecture.md`, `docs/changelog.md`. ≤ 15 files.

### Verification

- `bun run check` (typecheck + lint) clean.
- `bun run --filter '*' test` green.
- `bun run apps/api/scripts/smoke-plan-004.ts` green.
- `bun run apps/cli/scripts/smoke-aiw-run.ts` green — a new script that demonstrates `aiw run` end-to-end without HTTP.
- `aiw --version`, `aiw --help`, `aiw init`, `aiw run --help`, `aiw serve --help` all render correctly.
- Docker image builds unchanged; dashboard + worker containers come up with the same behaviour as main.

## Alternatives

### A — Thin CLI wrapper over current HTTP API (rejected)

`aiw` and `aim` become TypeScript wrappers that just hit the existing HTTP endpoints. Pros: zero refactor, one-week scope. Cons: does not deliver any of the stated goals — there is still no way to run a worker without a bound HTTP server, the "weight" stays exactly where it is, and web UI is still first-class. Rejected because it doesn't move the architecture toward the Hermes / OpenClaw shape.

### B — Hermes-style full rewrite (rejected)

Drop SQLite in favour of `~/.aiworker/` filesystem (skills / memories / transcripts as markdown + JSON), single-binary distribution, drop HTTP entirely, drop channel adapters until CLI works first. Pros: maximally lightweight, matches Hermes one-to-one. Cons: discards FEAT-003/004/005/006/007 (channel adapters + evolution), discards FEAT-014/015/018/019 (three-tier executor config, process manager, engine availability, model picker), discards FEAT-023 (manager-driven worker creation) entirely. Rejected: too much working infrastructure thrown away, and the user explicitly asked to build the gateway / web UI on top of the CLI, which requires preserving those features.

### C — OpenClaw RFC 42026 `local-split` only (rejected as main plan, accepted as stopgap)

Keep both HTTP servers, add only a WS IPC between dashboard and worker processes on the same host. Pros: smallest diff; proven OpenClaw model. Cons: doesn't deliver `aiw run` CLI REPL; still requires HTTP bindings on both sides. Could serve as a phase-2 fallback if the WS gateway design drags, but wouldn't be a main plan.

### D — Monorepo → polyrepo split (rejected)

Publish `@aiworker/core` + `@aiworker/cli` + `@aiworker/gateway` as separate npm packages with independent release cadences. Pros: decouples consumer teams. Cons: we have one team and one deployed environment; polyrepo overhead (dependency pinning, release coordination, CI matrix) is pure cost. Keep everything in the Bun workspace.

## Decision

Choose **Phase 1 of plan B** (core extraction + `aiw` CLI shell), per proposal above. Out-of-scope phases tracked as future PLANs (PLAN-012 ... PLAN-016) but not approved here.

Approved 2026-04-24 11:55 (`proceed`).

## Execution split (post-approval, 2026-04-24 11:55)

Phase 1 is split into two sub-phases to keep each merge atomic and the CLI visible early:

### Phase 1a (this session)

- Create `packages/storage-sqlite`; physically move `apps/api/src/db/**`, `apps/api/drizzle/**`, and `apps/api/drizzle.*.config.ts` into it. Rewire all 29 import sites in `apps/api/src/**` to `@aiworker/storage-sqlite`.
- Create `apps/cli` with the `aiw` binary (cac argv), subcommands `init` / `run` / `serve` / `config show|set` / `token rotate`. `apps/cli` depends on `@aiworker/api` (workspace lib export) + `@aiworker/storage-sqlite` + `@aiworker/shared`.
- Expose a library surface from `apps/api` via a new `src/lib.ts` re-exporting `bootstrapWorkerApp`, runtime builders, and bootstrap helpers. Add `exports` entry to `apps/api/package.json`.
- `aiw run --message "<text>"` demonstrates the "no HTTP bound" invariant: initWorkerDb + loadOrMintIdentity + buildWorkerRuntime + synthesise an `Envelope` + `orchestrator.ingest()` + stream events to stdout + exit.
- Smoke: new `apps/cli/scripts/smoke-aiw-run.ts`; existing `apps/api/scripts/smoke-plan-004.ts` untouched.
- Docs: update `docs/architecture.md` §"Layered Responsibilities" to mark storage as a separate package; create `docs/cli.md` with the `aiw` command reference; append changelog.

### Phase 1b (follow-up session)

- Physically move `apps/api/src/worker/**` into `packages/core/src/worker/**`.
- Move the minimum set of cross-cutting helpers (`shared/lib/ids.ts`, `shared/AppError`, `config/worker.ts`, `config/common.ts`) into `packages/core` or `packages/shared` as the import graph dictates.
- Add ESLint `no-restricted-imports` rule enforcing no apps/** imports inside `@aiworker/core`.
- `apps/cli` and `apps/api` both switch from `@aiworker/api` worker imports to `@aiworker/core`.
- Regression test: hot-reload still swaps `state.runtime` atomically; `runtime.dispose()` releases observer + proposer.

Rationale for the split: the 29-file db move is mechanical and low-risk (single import target swap); the 107-file worker/** move carries real regression risk (cross-cutting helpers, hot-reload runtime capture) and deserves its own review cycle. Delivering `aiw` in 1a gives the user a working CLI without waiting on 1b.

Phase 1b will be tracked by a new plan entry appended to `docs/plan/index.md` (likely **PLAN-012**) once 1a is merged. REFACTOR-003 stays `[-]` until both sub-phases close.
