# AIWorker Changelog

## 2026-04-22 17:30 [progress]

PLAN-007 step 3 / 6 — **FEAT-013 ACP harness + Gemini / Qwen adapters** landed. Second and third agentic-CLI engines now plug into the fleet; a fourth ACP-speaking engine (Copilot, Aider, Amp, ...) requires only a new data file in `engines/acp/agents/`.

Delivered via BKD worktree subtask `9395s1ev` (branch `bkd/9395s1ev`, 18 files, +2141 / -0 all-new). Subtask self-review passed after one fixup (stub path depth `..` count). Merged to main in `128f790`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'acp', agent: 'gemini' | 'qwen', model?, cliVersion?, extraArgs?, env?, timeoutMs? }` variant. Three-tier profile layer still deferred to FEAT-014.

API (all new under `apps/api/src/worker/executor/engines/acp/`):

- `harness.ts` — `AcpExecutor` implements `ExecutorProvider`: spawn resolution (PATH → npx fallback with env-driven version), stdio ACP session lifecycle (`initialize` → `newSession` → `prompt` → streaming `sessionUpdate` → `cancel`), 10-minute auth-probe cache, proactive close + peer dispose on child `exit code != 0`.
- `protocol.ts` — transport-agnostic `JsonRpcPeer`: request / response correlation, notification dispatch, inbound request handling (used for `session/request_permission` auto-approve), timeout + abort + dispose.
- `normalize.ts` — ACP `sessionUpdate` → `AgentEvent`. `ToolCall.kind` maps to `ToolAction.kind`: read → file_read, edit → file_edit, execute → command_run, search → search, fetch → web_fetch, think → task_plan, else → tool. `stopReason` mapped to `AgentFinishReason`.
- `types.ts` — JSON-RPC frame + ACP session / tool / stopReason wire types, module-local only.
- `agents/types.ts` — `AcpAgentDefinition` shape: `{ id, label, commandName, npxPackage, versionEnvVar, defaultVersion, buildArgs(cfg), authProbe() }`.
- `agents/gemini.ts` — `--experimental-acp --yolo --allowed-tools run_shell_command`; `authProbe` checks `~/.gemini/oauth_creds.json`.
- `agents/qwen.ts` — `--acp --yolo`; `authProbe` checks `~/.qwen/`.
- `agents/index.ts` — registry map.
- `apps/api/src/worker/executor/factory.ts` — `case 'acp'`.
- `apps/api/src/worker/management/config-schema.ts` + `info.ts` — zod schema + `executorInfoModel` branch for acp.
- `apps/api/src/worker/orchestrator/service.ts` — `executorModel()` helper covers acp.
- `apps/api/test-fixtures/cli/acp-stub.mjs` — pre-recorded ACP ndjson usable by both gemini and qwen harness tests.

Tests (61 new):

- `protocol.test.ts` — JsonRpcPeer request/response, notification, cancel, timeout, dispose.
- `normalize.test.ts` — `sessionUpdate` event → `AgentEvent` including `ToolKind` → `ToolAction.kind` inference and stopReason mapping.
- `harness.test.ts` — smoke: gemini + qwen both produce assistant-message + tool-use + finish events against the stub binary.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 319 / 319 (61 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline, zero new errors.

Deferred:

- ACP executor hasn't registered with `ProcessManager` → FEAT-015.
- CLI `--version` shell-out + DB-persisted availability → FEAT-015 or later.
- Default CLI versions (`gemini 0.9.0`, `qwen 0.0.14`) are placeholders — ops override via `GEMINI_CLI_VERSION` / `QWEN_CLI_VERSION` before production use.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-013.md`.

## 2026-04-22 10:17 [progress]

PLAN-007 step 2 / 6 — **FEAT-012 Claude Code executor with git worktree workspace** landed. This is the first true agentic-CLI adapter on the fleet: the orchestrator no longer drives the tool loop for this engine — the Claude CLI owns the in-process agent loop, built-in tools, and sandboxing.

Delivered via BKD worktree subtask `d1oqqs1m` (branch `bkd/d1oqqs1m`, 26 files, +1915 / -9). Subtask self-review fixed two P1s (dispose-race via queue-deferred dispose; `once(child,'exit')` reject on `error` wrapped with `.catch`). Merged to main in `b98c13e`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'claude-code', model?, cliVersion?, extraArgs?, env?, workspaceRoot?, timeoutMs? }` variant. Formal three-tier profile layer deferred to FEAT-014.
- `packages/shared/src/providers/executor.ts` — `AgentRunInput.workspacePath?: string` optional field so the orchestrator can hand a per-conversation workspace to the executor. Providers that don't need it (http / mcp) simply ignore the field.

API:

- **New** `apps/api/src/worker/executor/engines/claude-code/` module:
  - `executor.ts` — spawns `claude` from PATH first, falls back to `npx -y @anthropic-ai/claude-code@<version>`. Startup: `-p --verbose --output-format=stream-json --input-format=stream-json --include-partial-messages --replay-user-messages --dangerously-skip-permissions`. Default 120s timeout, abort-signal aware, child-error tolerant, spawn / binary resolver injectable for tests.
  - `protocol.ts` — stdio bidirectional control protocol peer; auto-approve policy default (all `PreToolUse` allow); deny / ask branches code-preserved for future interactive approval UI.
  - `normalize.ts` — stream-json → `AgentEvent`: assistant message / thinking delta, `tool_use` with `ToolAction.kind` inferred from tool name (Read/View → file_read, Edit/Write → file_edit, Bash → command_run, WebSearch/Grep → search, WebFetch → web_fetch, TodoWrite → task_plan, else → tool), user `tool_result`, `stop` → finish + usage, stream_event partial deltas, token_usage. NDJSON splitter merges across chunk boundaries.
  - `types.ts` — module-local CLI wire types.
- **New** `apps/api/src/worker/executor/workspace.ts` — `WorkspaceManager` with `createWorkspace(conversationId)` / `disposeWorkspace(conversationId)` / `purgeAll`. Enforces path-escape guard (conversationId regex + `isInside(WORKER_DATA_ROOT)` check). When `WORKER_WORKSPACE_GIT_ORIGIN` is set, provisions an isolated `git worktree add --detach`; otherwise a plain directory. Idempotent; concurrent create deduplicated.
- `apps/api/src/worker/runtime.ts` — `workspaces: WorkspaceManager` added to the runtime handle; survives hot-reload so workspace dirs persist across config swaps.
- `apps/api/src/worker/orchestrator/service.ts` — allocates a workspace per conversation on `ingest`, threads `workspacePath` into `run(...)`. On "new topic" classifier decision, dispose is enqueued on the orchestrator's FIFO queue so any prior in-flight run completes before the directory is deleted. No `toolDefinitions` injection for `claude-code`.
- `apps/api/src/worker/conversation/router.ts` — `classifyContinuation` accepts optional `workspacePath` so claude-code can classify when used as the conversation classifier.
- `apps/api/src/config/worker.ts` — new env vars `WORKER_DATA_ROOT`, `WORKER_WORKSPACE_GIT_ORIGIN`, `CLAUDE_CLI_VERSION`.
- `apps/api/src/worker/executor/factory.ts` — `case 'claude-code'`.
- `apps/api/src/worker/management/{config-schema.ts,info.ts}` + several `*.test.ts` — shape registration + model extraction for claude-code; stub runtime shape updated to include the `workspaces` field.

Tests (52 new):

- `engines/claude-code/{executor,protocol,normalize}.test.ts` + module-level fixtures.
- `workspace.test.ts` — path-escape guard + git worktree optional path.
- `orchestrator/service.claude-code.test.ts` — e2e smoke driving a web-channel envelope through a stub CLI (`apps/api/test-fixtures/cli/claude-stub.sh`), verifying at least one assistant-message event + one tool-use event land on the bus and persist to `worker.db.messages`.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 258 / 258 (52 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-012 introduced zero new lint errors.

Deferred (P3, tracked in FEAT-014 / FEAT-015):

- Frontend picker row for `claude-code` → FEAT-014.
- `info.ts` health for `claude-code` becoming process-aware → FEAT-015 (`ProcessManager`).
- stdout write backpressure drain → FEAT-015.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-012.md`.

## 2026-04-22 09:50 [progress]

PLAN-007 step 1 / 6 — **FEAT-011 Normalize AgentEvent schema + refactor OpenAI-compat executor** landed. The orchestrator hot path no longer speaks OpenAI-specific chunk shapes; every `ExecutorProvider` now emits a shared `AgentEvent` tagged union, laying the foundation for Claude Code / ACP / Codex / Cursor adapters in FEAT-012..016.

Shared:

- **New** `packages/shared/src/providers/agent-event.ts` — `AgentEvent` discriminated union (`assistant_message_delta`, `thinking_delta`, `tool_use`, `tool_result`, `permission_request`, `token_usage`, `finish`, `error`), `ToolAction` discriminated union (`file_read`, `file_edit`, `command_run`, `search`, `web_fetch`, `task_plan`, `tool`, `other`), `ToolStatus`, `TokenUsage`, `AgentFinishReason`. All backed by zod schemas exported from the package root.
- **Breaking** (internal only, pre-release): `ExecutorProvider.runChat` renamed to `run`; returns `AsyncIterable<AgentEvent>` instead of `AsyncIterable<ChatStreamChunk>`. Legacy `ChatStreamChunk` / `ChatRunInput` / `ChatFinishReason` / `ChatUsage` types removed outright — no alias, since the discriminators differ (`text` → `assistant_message_delta`, `tool_call` → `tool_use`).
- **Deps**: `@aiworker/shared` gains `zod ^3.24.4` (runtime) and `@types/bun ^1.2.13` (dev); tsconfig sets `types: ["@types/bun"]`.

API:

- `apps/api/src/worker/executor/providers/{http,mcp,cli}.ts` all reshape to `run()` → `AgentEvent`. `OpenAICompatibleExecutor` emits text deltas as `assistant_message_delta`, function calls as `tool_use` with `action.kind === 'tool'`, and adds standalone `token_usage` entries plus the normal `finish`. `McpExecutor.run` and `CliExecutor.run` still yield error then finish — their real implementations live in FEAT-012..016.
- `apps/api/src/worker/orchestrator/service.ts` + `apps/api/src/worker/conversation/router.ts` + `apps/api/src/worker/management/executor-test.ts` consume the new event shape. SSE event names (`orchestrator.text`, `orchestrator.tool_call`) preserved so the frontend contract is unchanged.

Tests:

- `packages/shared/src/providers/agent-event.test.ts` (new) — 7 schema cases covering happy-path and rejection of unknown types / missing args / bad action kinds.
- `apps/api/src/worker/executor/providers/http.test.ts` rewritten against `AgentEvent`.
- `apps/api/src/worker/management/{executor-test,routes}.test.ts` updated to stub with `run` instead of `runChat`.

Verification:

- `bun run typecheck` clean across shared, api, web.
- `bun test` green — shared 7 / 7, api 210 / 210, web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 unrelated errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-011 introduced zero new lint errors.

Not in this step:

- No new engine adapter — FEAT-012 (Claude Code + worktree) is next.
- No config schema change — `ExecutorConfig` stays three-way (`http` / `mcp` / `cli`) until FEAT-014.
- No concurrency change — `AsyncQueue` stays until FEAT-015.

Pointer: `docs/plan/PLAN-007.md` for the full six-FEAT roadmap.

## 2026-04-22 04:07 [release]

PLAN-006 landed end-to-end: **P2 batch — channel adapters (Telegram, Lark, WhatsApp) + evolution generator (pattern miner)**. All four FEAT stubs left behind by REFACTOR-002 / PLAN-003 are now real implementations, delivered in parallel via BKD worktree dispatch (`gfhkzgdg`) and serialised-merged in this order: SUB-1 → SUB-2 → SUB-3 → SUB-4.

Subtasks delivered:

- **FEAT-003 Telegram** (`bkd/x9u5jzz9` → `e8f94c1`). `verify` uses timing-safe `X-Telegram-Bot-Api-Secret-Token` compare (silent accept when secret unset per spec); `toEnvelopes` emits one envelope per `message.text` with `chatId = {chat.type}:{chat.id}`; `send` whitespace-chunks replies at 4096 chars and hard-slices as fallback. 12 adapter tests.
- **FEAT-004 Lark 飞书** (`bkd/izavqq37` → `756d2ec`). `verify` handles the optional `encrypt` envelope with AES-256-CBC (SHA-256-keyed, IV from first 16 bytes) before validating `verificationToken`; `toEnvelopes` normalises `im.message.receive_v1` text for p2p + group, `url_verification` returns `[]`; `send` exchanges tenant access tokens with a per-`appId` cache (60 s refresh margin + single-flight promise). 16 adapter tests. Interface change: `ChannelAdapter.toEnvelopes` gains an additive optional `binding?: ChannelBinding` param so the Lark adapter can reach encryptKey at decode time; `routes.ts` passes it through. No other adapter needed changes.
- **FEAT-005 WhatsApp (Meta Cloud API)** (`bkd/zi8wqgzs` → `727b64f`). `verify` parses `X-Hub-Signature-256`, HMAC-SHA256 over the raw body, hex-`timingSafeEqual`; `toEnvelopes` walks `entry[].changes[].value.messages[]`, falls back to media captions for image/audio/video/document, silently skips status updates; `send` targets Graph v21 `/messages` with `recipient_type: individual`. Adds `GET /whatsapp/webhook` subscription-challenge handler to `routes.ts` (404 on missing binding, 403 on token mismatch, 200 plaintext challenge echo). 10 adapter tests.
- **FEAT-006 Evolution generator** (`bkd/tbled0e0` → `a9e289d`). New `pattern-miner.ts` is pure (n-gram aggregation over `Map<conversationId, tool[]>`, min-occurrence + min-conversation thresholds, strict-prefix dedup, occurrence-then-length sort). `proposer.ts` rewrites the stub into a real writer: reads recent `evolution_observations` as the conversation window, joins `execution_logs.tool_name` per conversation, mines, dedups against existing `skill_drafts` + `skill_bindings.config.allowedTools`, writes `skill_drafts` rows. Schema unchanged — mined `allowedTools` / `confidence` / `sequenceKey` are embedded as an `<!-- evolution-meta: {...} -->` marker in `bodyMarkdown` and recovered via the exported `parseEvolutionMeta()`. `runProposerOnce()` + `startProposerLoop()` keep their zero-arg signatures; `EVOLUTION_PROPOSER_WINDOW` / `_MAX_DRAFTS_PER_RUN` / `_INTERVAL_MS` env vars override defaults. 5 miner tests + 5 proposer integration tests.

Shared-type discipline:

- `packages/shared/src/fleet/channel.ts` stayed frozen across all four subtasks, as required by PLAN-006.
- The only cross-cutting interface edit — `ChannelAdapter.toEnvelopes` gaining `binding?: ChannelBinding` — is additive (optional param) and documented; SUB-2 reported the decision in its completion follow-up, and the existing telegram / whatsapp / line / web adapters still satisfy the interface without code changes.

Merge strategy:

- All four branches were dispatched in parallel on fresh worktrees off `main@99ec908`.
- Coordinator (`gfhkzgdg`) serialised merges into `main` from the top-level worktree, running `bun run --cwd apps/api test` + `bun run check` (typecheck across shared/web/api + `eslint .`) after each. Test counts progressed cleanly: 174 (SUB-1) → 190 (SUB-2, +16 lark) → 200 (SUB-3, +10 whatsapp) → 210 (SUB-4, +10 miner/proposer).
- Only `apps/api/src/worker/channels/routes.ts` was touched by both SUB-2 and SUB-3, and on disjoint line ranges (SUB-2: POST-handler toEnvelopes call; SUB-3: new GET route block); the ort strategy auto-merged with no conflicts.

Deferred (explicitly out of MVP scope, flagged in subtask reports):

- Telegram: cards / photos / Markdown V2 `parse_mode`.
- Lark: interactive-card message support; route-level `url_verification` challenge echo (the adapter already returns `[]`; the HTTP echo is a route concern).
- WhatsApp: message-template handling + 24-hour session window tracking; attachment ingestion without caption (envelopes are silently skipped today).
- Channels overall: `fetch` without abort/timeout matches the existing `line.ts` pattern; a fleet-wide hardening pass is a separate concern.
- Evolution: `execution_logs` is not yet populated from the orchestrator path — miner is ready for when that wiring lands. Evolution-meta marker regex assumes flat JSON; safe today since the writer is its only producer.

Verification:

- `bun run --cwd apps/api test` → **210 pass / 0 fail** (24 files, 562 `expect()` calls).
- `bun run check` → typecheck clean across `@aiworker/shared`, `@aiworker/web`, `@aiworker/api`; `eslint .` clean across the repo.
- All four BKD subtasks (`x9u5jzz9`, `izavqq37`, `zi8wqgzs`, `tbled0e0`) transitioned to `done`; worktrees pruned.

Pointer: `docs/plan/PLAN-006.md` for the design matrix and per-subtask spec, and `docs/task/FEAT-00{3,4,5,6}.md` for the individual deliverables.

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
