# AIWorker Changelog

## 2026-04-21 18:30 [release]

FEAT-009 / PLAN-005 landed: **aissh-driven fleet deployment automation**. AIWorker now ships with a one-command deploy to `gateway.example.test` via the `aissh` CLI.

New artifacts:

- `ops/compose/docker-compose.yml` — production compose for the dashboard only. No docker-socket mount (MANAGER_CAN_LAUNCH stays off by default); image tag pinned via `AIWORKER_IMAGE_TAG` env so rollbacks are a tag swap.
- `ops/compose/.env.example` — host-local env template (`AIWORKER_MASTER_KEY`, `INTERNAL_SHARED_SECRET`, `AIWORKER_IMAGE_TAG`).
- `ops/caddy/Caddyfile.tmpl` — single-site template `gateway.example.test → 127.0.0.1:3000`. No per-worker routing (PLAN-004 made workers advertise their own externally-reachable URL).
- `scripts/deploy.ts` — Bun CLI wrapping aissh. Subcommands: `install-docker`, `teardown-legacy --confirm`, `build`, `upload`, `install`, `verify`, `reload-caddy`, `deploy` (chains the common path). Local `docker save | zstd` keeps the tarball under ~150 MB for the 961 MiB host; `install` verifies `/opt/aiworker-deploy/.env` carries the required secrets before loading.
- `scripts/tsconfig.json` — standalone typecheck for the ops CLI (pulls `@types/bun` from the api workspace).
- `docs/deployment.md` — run book: prereqs, first-time deploy, routine deploy, rollback, worker registration pointer, troubleshooting.

Deviations from the FEAT-009 task draft (authored pre-PLAN-004):

- Health endpoint is `GET /health` (dashboard + worker), not `/api/system/health`.
- Caddyfile does not strip a `{workerId}` prefix — workers own their externally-reachable URL after PLAN-004.
- First cut deploys the dashboard only. Worker provisioning is operator-driven via the registry (see PLAN-004); automating per-worker deploy is follow-up work for FEAT-007 / FEAT-008.

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- `bun run lint` clean across the repo (includes the new ops YAML + scripts TS).
- `bunx tsc --noEmit -p scripts/tsconfig.json` clean for `scripts/deploy.ts`.
- `bun run scripts/deploy.ts deploy --dry-run --tag=smoke-test` prints the full `build → upload → install → verify → reload-caddy` command chain without running anything. `teardown-legacy` without `--confirm` is correctly rejected.

Pointer: `docs/plan/PLAN-005.md` for the full design (deliverables, risks, rollback, alternatives) and `docs/deployment.md` for the operator-facing run book.

## 2026-04-21 11:30 [release]

PLAN-004 landed end-to-end: AIWorker has pivoted from the centralized PLAN-003 fleet model to **self-sufficient workers + manager-as-registry**. Each worker container now owns its identity, config, and secrets and serves its own `/api/worker/*` surface; the dashboard is a pointer store that registers worker URLs + bearer tokens and proxies UI traffic through.

Subtasks delivered (in BKD merge order):

- 1.1 — Shared types: `RegisteredWorker`, `WorkerIdentity`, `WorkerApiToken`, `WorkerInfo` (`ijo50kfz`).
- 1.2 — `worker.db` schema: `worker_identity` + `worker_config` + `worker_secrets` (`bgm8h8sz`).
- 1.3 — `fleet.db` rewrite: `registered_workers` + `audit_events` only (`zy8taekt`).
- 2.1 — Worker-side `SecretsVault` move + bootstrap flow (id mint, token mint, stdout print, encrypted persist) (`9qqs0iph`).
- 2.2 — Worker management API: `/info`, `GET+PUT /config` with hot reload, secrets CRUD (`b4r6p9l6`).
- 2.3 — Worker bearer-auth middleware + `/brain/test`, `/executor/test`, `/channels/:channel/test`, `/token/rotate`, `/reload` (`y4yvqyd5`).
- 3.1 — Manager `WorkerClient` + `POST /api/workers/register` (validates via worker `/info`) (`9ehtjkhv`).
- 3.2 — Manager registry CRUD + transparent `/api/workers/:id/proxy/worker/*` pass-through (`fj7utscp`).
- 3.3 — Periodic `/info` poll + `lastSeenAt / lastSeenState / lastConfigVersion` updates with audited state changes (`zdcboki0`).
- 3.4 — Optional `MANAGER_CAN_LAUNCH` flag + `POST /api/workers/launch-local` (gated supervisor wiring) (`1x3efm46`).
- 4.1 — Web: registered-workers list + register wizard + per-worker nested route shell + worker switcher (`rgxka0g0`).
- 4.2 — Web: per-worker config editor + secrets panel + test panel + token rotation (`56vtboxe`).
- 5.1 — End-to-end smoke (`apps/api/scripts/smoke-plan-004.ts`) + manager-side `POST /api/workers/:id/rotate-token` wrapper that re-encrypts the worker's freshly minted bearer into `registered_workers.apiTokenEnc` so post-rotate proxy/poll calls keep authenticating + this changelog (`sm5gj8vx`).

Breaking changes:

- **Worker env**: `WORKER_ID`, `WORKER_CONFIG_JSON`, `WORKER_CONFIG_VERSION` are gone. `AIWORKER_MASTER_KEY` (32-byte hex) is now **required** in both `worker` and `dashboard` modes — workers use it to seal `worker_identity`/`worker_secrets`; managers use it to seal `registered_workers.apiTokenEnc`. New optional knobs: `AIWORKER_FORCE_ID`, `AIWORKER_FORCE_TOKEN`, `AIWORKER_ADVERTISED_BASE_URL`.
- **Manager env**: docker-supervisor knobs (`AIWORKER_IMAGE`, `WORKER_DATA_ROOT`, `WORKER_MEMORY_LIMIT`, `WORKER_CPU_LIMIT`) became optional; required only when `MANAGER_CAN_LAUNCH=true`. New: `MANAGER_POLL_INTERVAL_MS` (default `30000`), `MANAGER_POLL_JITTER_MS` (default `3000`), `AIWORKER_LAUNCH_BASE_URL_TEMPLATE`.
- **fleet.db schema**: `workers`, `worker_configs`, `worker_secrets` tables removed; replaced by a single `registered_workers` table.
- **worker.db schema**: gained `worker_identity`, `worker_config`, `worker_secrets` (singletons + secret rows).
- **Webhook URLs**: workers own their own externally-reachable base URL — no more "manager strips the `/{workerId}/` prefix" routing requirement. Operators choose subdomain-per-worker, path-per-worker, or any other reverse-proxy topology.
- **Manager rotate flow**: web UI now calls the manager wrapper at `POST /api/workers/:id/rotate-token`, which returns `{ rotatedAt, lastFourOfNewToken }` and intentionally does NOT leak the new plaintext. Operators who need the plaintext call the worker directly via `POST /api/workers/:id/proxy/worker/token/rotate`.

Migration note (pre-release, destructive OK): both `drizzle/fleet/0000_*.sql` and `drizzle/worker/0000_*.sql` were regenerated to match the new schemas. Delete any local `apps/api/data/fleet.db*` and per-worker `worker.db*` before the next dev boot; `initFleetDb` / `initWorkerDb` re-run their migration set on startup.

Verification:

- `bun run check` clean across `shared`, `api`, `web`.
- `bun test` clean (registry routes/service/poll/rotate-token + worker bootstrap/identity/secrets/config/management/rotate suites).
- `apps/api/scripts/smoke-plan-004.ts` boots a worker + manager via `bun src/index.ts`, registers, configures, rotates, and round-trips a web channel echo — exits 0.
- Dev-server bind regression flagged in 4.1 fixed: `apps/api/src/dev.ts` now re-exports `index.ts`'s default `{ fetch, port }` so `bun src/dev.ts` actually serves traffic.

Pointer: `docs/plan/PLAN-004.md` for the full design (target architecture, data model, auth model, migration table, risks).

## 2026-04-21 09:15 [progress]

REFACTOR-002 / PLAN-003 landed the backend + ops scaffolding for the multi-worker fleet architecture. AIWorker is now modelled as a **fleet** (a group of workers) where each worker runs in its own docker container with independent Brain, Executor, Channels, and Evolution layers.

Backend:

- **Shared types** (`packages/shared/src/fleet/`): `Worker`, `WorkerConfig`, `ChannelBinding`, `Envelope`, `BrainSourceConfig`, `ExecutorConfig` (discriminated `http`/`mcp`/`cli`), `ConversationDecision`, `SkillDraft`, `EvolutionObservation`, etc. Dual worker identity (`w_` + 12 Crockford base32 immutable id + mutable human slug).
- **DB split** — `fleet.db` (dashboard: `workers`, `worker_configs`, `worker_secrets`, `audit_events`) + `worker.db` (per-worker-container: `agent_tasks`, `conversations`, `messages`, `execution_logs`, `skill_bindings`, `skill_drafts`, `evolution_observations`). Two Drizzle configs, `bun run db:generate` regenerates both migration sets.
- **Mode dispatch** — one Bun binary, `AIWORKER_MODE=dashboard|worker` selects the runtime. `src/config/{common,dashboard,worker}.ts` hold mode-specific env schemas; `src/modes/{dashboard,worker}.ts` create the Hono app per mode; `src/index.ts` picks.
- **Dashboard mode**: `src/dashboard/secrets` (AES-256-GCM vault gated by 32-byte hex `AIWORKER_MASTER_KEY`, with 5 passing tests); `src/dashboard/fleet` (workers CRUD + redacted/hydrated config split); `src/dashboard/supervisor` (unix-socket docker client via Bun `fetch({ unix })`, manages worker containers: spawn / start / stop / restart / remove / inspect / logs).
- **Worker mode**: `src/worker/brain/` (`HermesProvider`, `CloudGatewayBrainProvider`, plus new `MultiBrainProvider` aggregating per-worker source list); `src/worker/executor/` (factory over `http` / `mcp` / `cli`; `CliExecutor` spawns via `node:child_process`, `sandbox` flag reserved for FEAT-002); `src/worker/channels/` (envelope + 5 adapters: `web` + `line` working, `telegram` / `lark` / `whatsapp` stubbed behind `ChannelNotImplementedError`; HMAC signature verify on Line); `src/worker/conversation/router.ts` (Agent-driven continuation classifier — no hardcoded timeouts); `src/worker/orchestrator/service.ts` (per-worker queue, channel-routed ingest, text chat loop, SSE event emission, outbound channel delivery); `src/worker/evolution/` (observer wired to the event bus writes `evolution_observations`; proposer is a stub logger pending FEAT-006; approval routes for skill drafts).
- **URL map**: public `POST /{channel}/webhook` + internal `/api/worker/*` + dashboard `/api/workers[/:id]*`. External format `https://{host}/{workerId}/{channel}/webhook` — Caddy strips the `{workerId}` prefix and routes to the worker container over the docker network.
- **Ops**: root `Dockerfile` (multi-stage, single image for both modes) + `docker-compose.yml` (dashboard container with docker socket mounted).

Docs:

- `docs/plan/PLAN-003.md` — full four-layer (Communication / Brain / Evolution / Executor) design. Approved 2026-04-21 07:40 and moved to `implementing`.
- `docs/task/REFACTOR-002.md` — in_progress. Future-work placeholders created: `FEAT-002` (executable skills runtime), `FEAT-003` (Telegram), `FEAT-004` (Lark), `FEAT-005` (WhatsApp), `FEAT-006` (evolution generator), `FEAT-007` (M:1 channel routing), `FEAT-008` (multi-host HA), `FEAT-009` (aissh-driven deployment).

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- 11 unit tests pass: 5 `SecretsVault` + 6 `OpenAICompatibleExecutor`.

Not in this checkpoint (explicitly deferred):

- Web frontend restructure (workers list + per-worker nested routes + worker switcher + skill-binding editor). Web app typechecks but its routes still call legacy `/api/skills`, `/api/memory`, etc. — will go away after the frontend rewrite.
- Full smoke test (fleet-boot-via-docker + worker-spawn + channel-roundtrip).
- Deployment automation — tracked in FEAT-009 per user direction.

## 2026-04-21 06:45 [progress]

Added `CloudGatewayBrainProvider` as a second `BrainProvider` implementation. It talks to a cloud-gateway MCP server over streamable-HTTP (JSON-RPC 2.0) and maps `BrainProvider` methods to the server's `knowledge_*` tools (`knowledge_types` → skills, `knowledge_query` → listMemories, `knowledge_search` → searchMemories, `knowledge_write` → writeMemory). Runtime provider selection is controlled by the new `BRAIN_PROVIDER` env (`hermes` default, `cloud-gateway` when MCP URL + token are provided). Deployed to the production server; `/health` now reports `brain.status=ok` against cloud-gateway, `/api/skills` surfaces the knowledge types as brain skills. New files: `apps/api/src/adapters/mcp/{client,index}.ts`, `apps/api/src/providers/brain/cloud-gateway.ts`. Env additions: `BRAIN_PROVIDER`, `CLOUD_GATEWAY_MCP_URL`, `CLOUD_GATEWAY_MCP_TOKEN`, `CLOUD_GATEWAY_DEFAULT_CATEGORY`, `CLOUD_GATEWAY_DEFAULT_TYPE_ID`.

## 2026-04-20 20:30 [progress]

Agent Runtime refactor (PLAN-002) complete. AIWorker is now a self-hosted Agent Runtime that composes a **Brain provider** (Hermes — knowledge/memory) and an **Executor provider** (OpenAI-compatible chat completions + tool calling). Backend modules (`skills`, `memory`, `execution`, `health`) were rewired behind `BrainProvider` / `ExecutorProvider` interfaces; a new `orchestrator` module drives the full loop (submit → tool_call → write_memory → succeeded) with per-task queue, cancellation, and SSE broadcasts. Frontend shipped a new `/orchestrator` route (task list, replay, live updates) and the six existing pages were renamed from Hermes/OpenClaw to Brain/Executor terminology.

- **DB reset procedure**: delete `apps/api/data/aiworker.db*` before the next dev run; `initDb` auto-runs all Drizzle migrations on boot. New tables: `agent_tasks`, `conversations`, `messages`; `execution_logs` gained a `conversationId` FK; `skill_conflicts` now uses `brain_hash` / `executor_hash` columns.
- **Env additions**: `OPENAI_BASE_URL` (default `https://api.openai.com`), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_TIMEOUT_MS` (default `60000`). See `apps/api/.env.example`.
- **Env deprecations**: `OPENCLAW_WS_URL`, `OPENCLAW_HOME` remain in the schema for transitional compatibility but are no longer surfaced via `/api/config`.
- **API shape changes**: `/api/health` now reports `services.brain` and `services.executor` (previously `hermes` / `openclaw`); `/api/skills/*` sources use the `brain` | `executor` enum; `/api/skills/conflicts` returns `brainHash` / `executorHash`.
- **New surfaces**: `POST|GET /api/orchestrator/tasks`, `GET /api/orchestrator/tasks/:id`, `POST /api/orchestrator/tasks/:id/cancel`; SSE stream at `GET /api/events/stream` emits `orchestrator.task.started|message|tool_call|finished|failed|cancelled`; frontend `/orchestrator` page consumes it live.
- **E2E coverage**: `apps/api/src/modules/orchestrator/e2e.test.ts` exercises the "Remember that I prefer TypeScript strict mode" scenario end-to-end with a scripted executor — no OpenAI credentials required; run with `bun test src/modules/orchestrator/e2e.test.ts` from `apps/api`.

## 2026-04-20 17:15 [progress]

Phase 3 + 4 complete. Backend gained `execution`, `config`, `events` modules (REST + SSE). Web app scaffolded with Vite 8 + TanStack Router/Query + Tailwind v4 + Base UI primitives, and all six pages implemented: Dashboard (live SSE feed + service status), Skills (list/diff/conflicts tabs with sync trigger), Memory Explorer (search + filters + new), Execution Monitor (stats, filters, live tool feed, paginated table), Config Editor (read/write Hermes YAML + OpenClaw JSON with backup), Sync Status (timeline + run sync). Drizzle migrations auto-applied on `initDb`. Vite proxy now respects `AIWORKER_API_URL`. `bun run typecheck` and `bun run lint` clean across all workspaces.

## 2026-04-20 09:45 [progress]

Project initialized with PMA docs structure.
