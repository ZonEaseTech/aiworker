# PLAN-004 Self-sufficient worker + manager-as-registry

- **status**: draft
- **createdAt**: 2026-04-21 08:20
- **approvedAt**: (pending)
- **relatedTask**: REFACTOR-002
- **supersedes-in-progress**: PLAN-003 (phase 1 scaffold committed at 9e38180; remaining PLAN-003 phases absorbed or dropped here)

## Context

### Starting point (post PLAN-003 phase 1, committed 9e38180 on main)

In place:

- Shared types (`packages/shared/src/fleet/`): `Worker`, `WorkerConfig`, `ChannelBinding`, `Envelope`, discriminated `BrainSourceConfig` (hermes/cloud-gateway) and `ExecutorConfig` (http/mcp/cli), `ConversationDecision`, `SkillDraft`, `EvolutionObservation`, dual worker identity (`w_<12 Crockford base32>` + slug).
- Double DB: `fleet.db` (workers / worker_configs / worker_secrets / audit_events) + `worker.db` (agent_tasks / conversations / messages / execution_logs / skill_bindings / skill_drafts / evolution_observations).
- Mode dispatch (`AIWORKER_MODE` = `dashboard` | `worker`), two entry points.
- AES-256-GCM `SecretsVault` (5 tests) under `src/dashboard/secrets/`.
- Dashboard fleet CRUD + secret redact/hydrate around `WorkerConfig`.
- `FleetSupervisor` over docker unix socket (Bun-native `fetch({ unix })`).
- Worker runtime: `MultiBrainProvider`, executor factory (http / mcp / cli with `CliExecutor` spawning via `node:child_process`), channel framework (web + line working; telegram / lark / whatsapp stubbed), Agent-driven conversation classifier, orchestrator with queue + SSE event bus, evolution skeleton (observer + stub proposer + approval routes).
- Ops: Root `Dockerfile` (single image, dual mode) + `docker-compose.yml` (dashboard + docker.sock mount).

### The pivot (user direction, 2026-04-21)

> "Manager 和 worker 是相互独立的，不要耦合 —— 任意启动一个 worker 也是马上可以配置上线的，manager 只是一个顶层的管理"

Translation: workers are first-class, self-sufficient units. A worker deployed alone (anywhere, any way) must be immediately configurable and online through **its own** HTTP API. Manager is a registry/aggregator layer that discovers workers and drives their config via the workers' own APIs; manager failure must never prevent a worker from operating. Worker identity, config, and secrets all live with the worker, never with the manager.

### What changes vs PLAN-003

| Responsibility | PLAN-003 (landed) | PLAN-004 (target) |
|---|---|---|
| Worker identity minting | Dashboard generates on create | **Worker** mints on first boot |
| Worker config ownership | `fleet.db.worker_configs` (dashboard) | **`worker.db.worker_config`** (worker) |
| Secrets storage | `fleet.db.worker_secrets` (dashboard) | **`worker.db.worker_secrets`** (worker) |
| Secrets vault master key | Dashboard's `AIWORKER_MASTER_KEY` | Each worker has its own; manager has its own separately (to encrypt stored API tokens) |
| Worker runtime config source | `WORKER_CONFIG_JSON` env at container spawn | Read from worker.db at boot; updates via HTTP API + hot reload |
| Webhook URL structure | `https://{manager}/{workerId}/:channel/webhook` routed through dashboard | Worker owns its URL; any reverse-proxy topology works (subdomain-per-worker, path-per-worker, separate host — operator's choice) |
| Manager adds a worker | Create record + spawn container + push config via env | **Register an existing URL + API token**; optional "launch-local" is a convenience feature |
| Manager down | Workers can't be created; running workers still serve | Workers completely unaffected |

### What carries over (95% of PLAN-003 code)

- All shared types except `CreateWorkerInput`/`UpdateWorkerInput` shapes (revised).
- Entire worker runtime: brain / executor / channels / conversation / orchestrator / evolution. Only the config source changes.
- `SecretsVault` code — moves from `src/dashboard/secrets/` to `src/worker/secrets/`.
- Secret-paths redact/hydrate helpers — move from `src/dashboard/fleet/` to `src/worker/config/`.
- Executor / channel / brain adapter files — unchanged.
- Dockerfile + docker-compose — mostly unchanged; compose's "spawn worker" section simplified.
- `FleetSupervisor` — retained, downgraded to optional "managed launch" feature behind a feature flag.

## Proposal

### Target architecture

```
Operator deploys a worker (anywhere):
  docker run -d \
    -e AIWORKER_MODE=worker \
    -e AIWORKER_MASTER_KEY=<32-byte hex> \
    -e PORT=3001 \
    -v worker-data:/var/lib/aiworker \
    -p 3001:3001 \
    aiworker-runtime:<tag>

Worker on first boot:
  stdout:  workerId=w_k7hp3m2nq8fz
  stdout:  bootstrap apiToken=wtk_9f3c...  ← printed ONCE, operator saves it

Operator then either:
  a) curl directly to configure the worker, OR
  b) register the worker in a running manager UI

Manager (optional, any host):
  ┌────────────────────────────────────────────┐
  │ fleet.db (registry + audit only)            │
  │   registered_workers:                       │
  │     id, baseUrl, apiTokenEnc, displayName,  │
  │     lastSeenAt, lastSeenState,              │
  │     lastConfigVersion                       │
  │                                             │
  │ Endpoints:                                  │
  │   POST /api/workers/register                │
  │   GET  /api/workers                         │
  │   GET  /api/workers/:id                     │
  │   PATCH /api/workers/:id                    │
  │   DELETE /api/workers/:id                   │
  │   * /api/workers/:id/proxy/worker/*         │
  │   Background: poll each worker's /info      │
  └─────────────────┬──────────────────────────┘
                    │ HTTPS + Bearer wtk_...
                    ▼
  ┌────────────────────────────────────────────┐
  │ Worker (self-sufficient, independent)      │
  │ worker.db:                                  │
  │   worker_identity (id, apiTokenEnc, ...)    │
  │   worker_config   (configJson, version)     │
  │   worker_secrets  (key, valueEnc, ...)      │
  │   + existing runtime tables                 │
  │                                             │
  │ Public endpoints (no auth, signature):      │
  │   POST /:channel/webhook                    │
  │                                             │
  │ Management (Bearer wtk_... auth):           │
  │   GET  /api/worker/info                     │
  │   GET  /api/worker/config                   │
  │   PUT  /api/worker/config   + hot reload    │
  │   GET  /api/worker/secrets                  │
  │   PUT  /api/worker/secrets/:key             │
  │   DELETE /api/worker/secrets/:key           │
  │   POST /api/worker/brain/test               │
  │   POST /api/worker/executor/test            │
  │   POST /api/worker/channels/:channel/test   │
  │   POST /api/worker/token/rotate             │
  │   POST /api/worker/reload                   │
  │   GET  /api/worker/events/stream (SSE)      │
  │   /api/worker/orchestrator/* (existing)     │
  │   /api/worker/evolution/*   (existing)      │
  └────────────────────────────────────────────┘
```

### Data model changes

**fleet.db** (manager-owned) — simplified to a registry:

```typescript
// registered_workers — the manager's view of each worker it tracks.
// Does NOT duplicate worker config; only pointers + auth + liveness.
{
  id: text pk                             // mirrors worker's self-declared id (w_xxx)
  baseUrl: text notNull                   // e.g. https://bot-sales.example.com
  displayName: text notNull
  apiTokenEnc: text notNull               // AES-GCM(wtk_..., managerMasterKey)
  nonce: text notNull
  authTag: text notNull
  addedAt: text iso notNull
  addedBy: text? ('manual'|'launch-local'|'import')
  lastSeenAt: text iso?                   // last successful /info poll
  lastSeenState: text?                    // online|offline|auth-failed|config-version-mismatch
  lastConfigVersion: integer?             // from worker /info
}

// audit_events — unchanged
```

**Removed** from fleet.db: `workers`, `worker_configs`, `worker_secrets`. New migration `0001_registry_only.sql`.

**worker.db** (worker-owned) — gains three tables:

```typescript
// worker_identity — singleton, pk always 'default'.
{
  pk: text pk default('default')
  workerId: text notNull unique           // self-minted w_xxx (immutable)
  apiTokenEnc: text notNull               // AES-GCM(wtk_..., workerMasterKey)
  nonce: text notNull
  authTag: text notNull
  bootstrapShownAt: text iso              // first stdout print time
  createdAt: text iso notNull
  rotatedAt: text iso?                    // set on /token/rotate
}

// worker_config — singleton, pk always 'default'.
{
  pk: text pk default('default')
  configJson: text notNull (json WorkerConfig)
  version: integer notNull                // monotonic; bumped on every PUT
  updatedAt: text iso notNull
  updatedBy: text?                        // 'bootstrap'|'api'|'cli'
}

// worker_secrets — one row per secret key.
{
  id integer pk autoIncrement
  key text notNull unique
  valueEnc text notNull
  nonce text notNull
  authTag text notNull
  createdAt, updatedAt: text iso notNull
}
```

Existing runtime tables (agent_tasks / conversations / messages / execution_logs / skill_bindings / skill_drafts / evolution_observations) unchanged.

### Worker bootstrap

Required env:
- `AIWORKER_MODE=worker`
- `AIWORKER_MASTER_KEY` — 32-byte hex, required
- `WORKER_DB_PATH` — default `/var/lib/aiworker/worker.db`
- `WORKER_MIGRATIONS_FOLDER` — default `./drizzle/worker`
- `PORT` — default `3001`

Optional env (deployment continuity):
- `AIWORKER_FORCE_ID=w_...` — if first boot, use this id instead of minting (lets you redeploy with a stable webhook URL)
- `AIWORKER_FORCE_TOKEN=wtk_...` — same for the API token (lets you scripted-provision)

Boot sequence (`src/modes/worker.ts`):

1. Run worker.db migrations
2. Load `worker_identity` row:
   - Present → use the stored id + decrypt token for auth checks
   - Absent → mint id (from env override or `mintWorkerId()`); mint API token (`wtk_` + 32 bytes base64url); encrypt + persist; print once to stdout:

       ```
       [worker] id=w_k7hp3m2nq8fz
       [worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_9f3c...    (save this — it will not be printed again)
       ```

3. Load `worker_config`:
   - Present → use stored config
   - Absent → persist a default-empty config `{ brains: [], executor: http-stub, channels: [], evolution: { enabled: false, observationRetentionDays: 7 } }`, version 1
4. `buildWorkerRuntime(workerId, config)` — tolerant of empty brains / channels (no webhooks respond, `/api/worker/*` still serves)
5. Attach a config-change listener: whenever `worker_config` is updated through the PUT endpoint, rebuild the runtime atomically and swap (in-flight requests finish on the old runtime; new calls go to the new one)
6. Start HTTP server

### Worker management API

Every `/api/worker/*` route requires `Authorization: Bearer <apiToken>`. Signature-based webhooks (`/:channel/webhook`) do NOT use this auth (they use channel-specific HMAC).

`GET /api/worker/info`

```json
{
  "workerId": "w_k7hp3m2nq8fz",
  "runtimeVersion": "0.3.0",
  "configVersion": 12,
  "brains": [{ "id": "main-kb", "type": "cloud-gateway", "status": "healthy" }],
  "executor": { "type": "http", "model": "gpt-4o-mini", "status": "healthy" },
  "channels": [{ "channel": "line", "enabled": true, "webhookUrl": "https://.../line/webhook" }],
  "evolutionEnabled": false,
  "startedAt": "2026-04-21T08:30:00Z"
}
```

`GET /api/worker/config` — returns redacted WorkerConfig (secrets as empty strings).

`PUT /api/worker/config` — accepts full WorkerConfig. Validates schema. Splits secrets (reusing `enumerateSecretPaths`) into `worker_secrets`; stores redacted body in `worker_config`; bumps version; atomically rebuilds runtime; emits `config.updated` event on bus. Responds with the new redacted config + version. Optional `If-Match: <oldVersion>` header for optimistic concurrency.

`GET /api/worker/secrets` — list of keys (no values).

`PUT /api/worker/secrets/:key` — body `{ "value": "..." }`. Replaces one secret; does NOT touch config. Most UIs use `PUT config` for structured updates; this endpoint is for out-of-band key rotation.

`DELETE /api/worker/secrets/:key` — remove one secret.

`POST /api/worker/brain/test` — runs `brain.health()` across sources; returns per-source status.

`POST /api/worker/executor/test` — runs `executor.health()`; returns status + optional tiny chat probe.

`POST /api/worker/channels/:channel/test` — body may contain `chatId` + `text` for a dry-run echo. Returns the raw platform response.

`POST /api/worker/token/rotate` — requires current token in Authorization header; generates new token; updates `worker_identity`; responds with new token (in body); operator/manager must save it.

`POST /api/worker/reload` — force rebuild runtime (no config change). Rare; diagnostic use only.

`GET /api/worker/events/stream` — SSE, unchanged.

Existing `/api/worker/orchestrator/*` + `/api/worker/evolution/*` — unchanged.

Public: `POST /:channel/webhook` — unchanged.

### Manager registry API

`POST /api/workers/register`

```json
{
  "baseUrl": "https://bot-sales.example.com",
  "apiToken": "wtk_9f3c...",
  "displayName": "Sales Bot"
}
```

Manager calls `GET {baseUrl}/api/worker/info` with the token; on 200, stores `{ id=info.workerId, baseUrl, apiTokenEnc (managerMasterKey), displayName, addedAt=now, addedBy='manual' }`. On auth failure, returns 401. On `info` mismatch (already-registered id), returns 409.

`GET /api/workers` — list (with `lastSeenAt`, `lastSeenState`, `lastConfigVersion`).

`GET /api/workers/:id` — single row.

`PATCH /api/workers/:id` — only `displayName` and `baseUrl` (for URL changes). `apiToken` update goes through `POST /api/workers/:id/rotate-token` which first calls the worker's own `/api/worker/token/rotate`.

`DELETE /api/workers/:id` — unregister. Worker itself untouched.

`* /api/workers/:id/proxy/worker/*` — transparent pass-through: forwards any method / body to `{baseUrl}/api/worker/*` with Bearer header injected. Lets the web UI call worker endpoints without duplicating routes per worker.

Background job (`src/dashboard/poll/service.ts`): every `MANAGER_POLL_INTERVAL_MS` (default 30000), iterates registered workers, calls `GET {baseUrl}/api/worker/info`; updates `lastSeenAt / lastSeenState / lastConfigVersion`. Failures → `lastSeenState='offline'`. Authentication 401 → `lastSeenState='auth-failed'`.

Optional convenience (feature flag `MANAGER_CAN_LAUNCH=true`):

`POST /api/workers/launch-local` — body `{ displayName, masterKey? }`. Uses existing supervisor to spawn a worker container on the manager's host with a generated master key, then polls its `/info` to grab the bootstrap token, then auto-registers. Removes the two-step "deploy then register" friction when operator is on a single-host dev setup.

### Auth model

- **Worker API token**: 32 random bytes base64url + `wtk_` prefix. Bootstrapped once; persisted encrypted; rotatable.
- **Token comparison**: constant-time compare against decrypted stored value.
- **Manager master key**: separate from any worker's master key. Used only to encrypt stored `apiToken`s. Env: `AIWORKER_MASTER_KEY` on manager; when `AIWORKER_MODE=worker`, the same env var is that worker's own master key.
- Missing master key = process refuses to start, error tells operator how to mint one (`openssl rand -hex 32`).

### Reverse proxy flexibility

Worker is agnostic. Common deployments:

**A. Subdomain per worker**

```
bot-sales.example.com { reverse_proxy worker-sales:3001 }
bot-support.example.com { reverse_proxy worker-support:3001 }
manager.example.com { reverse_proxy manager:3000 }
```

**B. Single host, path per worker (legacy-friendly)**

```
gateway.example.test {
  @worker path_regexp ^/(w_[0-9a-z]+)(/.*)?$
  handle @worker {
    reverse_proxy aiworker-{re.worker.1}:3001
  }
  handle { reverse_proxy aiworker-manager:3000 }
}
```

Manager stores `baseUrl` so external platforms register the correct URL. The `POST /api/workers/register` accepts any valid URL; that's the contract.

### Migration from PLAN-003 phase 1

Pre-release → destructive migration acceptable.

- Delete generated fleet.db migration (`drizzle/fleet/0000_giant_korg.sql`) and regenerate with the new schema (new `0000_*.sql`).
- Delete generated worker.db migration (`drizzle/worker/0000_breezy_jasper_sitwell.sql`) and regenerate with `worker_identity` + `worker_config` + `worker_secrets` added.
- `src/dashboard/fleet/service.ts` rewritten as registry CRUD.
- `src/dashboard/fleet/secret-paths.ts` moves → `src/worker/config/secret-paths.ts`.
- `src/dashboard/secrets/*` moves → `src/worker/secrets/*`.
- `src/dashboard/supervisor/*` stays; becomes `MANAGER_CAN_LAUNCH`-gated feature.
- `src/config/worker.ts` drops `WORKER_CONFIG_JSON` / `WORKER_CONFIG_VERSION`; adds `AIWORKER_MASTER_KEY` (required), `AIWORKER_FORCE_ID` (optional), `AIWORKER_FORCE_TOKEN` (optional).
- `src/config/dashboard.ts` keeps `AIWORKER_MASTER_KEY` (for manager's own encrypted token store); drops `AIWORKER_IMAGE` / `WORKER_MEMORY_LIMIT` / `WORKER_CPU_LIMIT` / `WORKER_DATA_ROOT` unless `MANAGER_CAN_LAUNCH=true`.
- `docker-compose.yml` simplified: dashboard service only; worker service becomes an opt-in example with comments showing how to add one or many.

### Execution plan (BKD worktree, 12 subtasks across 5 phases)

| # | Title | Depends on | Reference files |
|---|---|---|---|
| 1.1 | Shared types: add `RegisteredWorker`, `WorkerIdentity`, `WorkerApiToken`, `WorkerInfo` response | — | `packages/shared/src/fleet/*` |
| 1.2 | worker.db schema: add `worker_identity` / `worker_config` / `worker_secrets` tables + migration regeneration | 1.1 | `apps/api/src/db/worker/schema.ts` |
| 1.3 | fleet.db rewrite: `registered_workers` + audit_events only; drop old tables; migration regeneration | 1.1 | `apps/api/src/db/fleet/schema.ts` |
| 2.1 | Move `SecretsVault` + `secret-paths` to worker-side; worker bootstrap (identity + token mint, stdout print, persist encrypted) | 1.2 | new: `apps/api/src/worker/secrets/*`, `apps/api/src/worker/config/*`, revise `src/modes/worker.ts` |
| 2.2 | Worker management API: `/info`, `GET+PUT /config` with hot-reload, secrets CRUD | 2.1 | new: `apps/api/src/worker/management/routes.ts` |
| 2.3 | Worker test endpoints + token rotate + internal reload; Bearer-auth middleware | 2.2 | same dir |
| 3.1 | Manager-side `WorkerClient` (HTTP client over a `{ baseUrl, apiToken }`) + `POST /api/workers/register` with validation via worker `/info` | 1.3 | new: `apps/api/src/dashboard/registry/client.ts`, `routes.ts`, `service.ts` |
| 3.2 | Manager fleet CRUD rewrite (list/get/patch/delete) + transparent `/proxy/worker/*` pass-through | 3.1 | replaces `src/dashboard/fleet/*` |
| 3.3 | Manager periodic poll + `lastSeen*` updates | 3.2 | new: `src/dashboard/registry/poll.ts` |
| 3.4 | Optional `MANAGER_CAN_LAUNCH` flag + `/api/workers/launch-local` reusing existing supervisor | 3.2 | gated wiring in `src/modes/dashboard.ts` |
| 4.1 | Web: registered-workers list + register wizard + per-worker nested route shell + worker switcher | 3.1, 3.2 | `apps/web/src/routes/*`, `apps/web/src/features/workers/*` |
| 4.2 | Web: per-worker config editor (brain + executor + channels + secrets + token rotate + test buttons) | 4.1, 2.2, 2.3 | `apps/web/src/features/workers/config/*` |
| 5.1 | E2E smoke: bare `docker run` worker → read bootstrap token from logs → register in manager → configure via UI → LINE webhook round-trip visible in manager conversation view | all | `apps/api/src/worker/management/smoke.test.ts` or a script |

Worktree mode (`useWorktree: true`) for all 12 subtasks. Each subtask self-reviews (`/pma-cr`), fixes P0/P1, then reports to coordinator. Coordinator merges `bkd/{issueId}` branches into `main`.

## Risks

1. **Bootstrap token loss** — printed only once; if operator misses it, recovery requires `AIWORKER_MASTER_KEY`. Mitigation: add a `worker show-token` CLI subcommand that decrypts `worker_identity.apiTokenEnc` using the master key.
2. **Per-worker master keys in prod** — N workers, N keys to manage. Mitigation: document recommended patterns (env from a secrets manager; `AIWORKER_MASTER_KEY_FILE` env as an alternative reading from mounted file).
3. **Hot reload races** — mid-flight requests should complete on old runtime. Mitigation: atomic swap of a `currentRuntime` ref; all route handlers capture the ref at the top of the handler.
4. **Optimistic concurrency on config** — concurrent PUT from two clients. Mitigation: `If-Match: <version>` header; server returns 409 if mismatch.
5. **Manager token encryption at rest** — if manager's `AIWORKER_MASTER_KEY` is lost, all registered tokens become unrecoverable (operators must re-register). Mitigation: document the risk; same key backup advice as worker master keys.
6. **Periodic poll load** — N workers × 30s polls. Mitigation: jitter; configurable interval; later iteration can add worker → manager push on changes.
7. **"Launch-local" feature splitting ops code paths** — managed vs unmanaged workers behave the same from the UI but have different lifecycle. Mitigation: keep launch-local behind a feature flag; UI adds a single badge on the worker card.
8. **Channel webhook url exposure during registration** — manager UI needs to show the operator "this is what you paste into LINE/Telegram/…"; that URL depends on how worker is exposed externally. Mitigation: worker's `/info` returns `advertisedBaseUrl` env var (operator-set on worker container) that the manager displays.

## Scope

- Backend: ~1200 LOC changes. Worker management API + bootstrap (~600 LOC), manager registry rewrite (~500 LOC), schema migrations (~100 LOC).
- Frontend: ~1500 LOC. Workers list + register wizard + per-worker config editor.
- Docs + ops: ~300 LOC.
- 12 BKD subtasks, worktree mode.

Deliverable: operator runs `docker run ... aiworker-runtime:dev` with only a master key; the worker boots, prints its token; operator registers it in a running manager UI; configures its Line channel + brain + executor in the UI; sends a test message to the Line bot; sees the conversation in the manager UI — all without the manager ever touching worker.db directly.

## Alternatives

1. **Keep PLAN-003 centralized model** — rejected by user: decoupling is a hard requirement.
2. **Replicated fleet.db** — each worker keeps a read replica of the manager's registry. Rejected: workers should not know about other workers.
3. **mTLS instead of Bearer** — rejected: heavier than Bearer for MVP; can be added later if threat model demands it.
4. **JWT with expiry instead of long-lived bearer** — rejected: single-operator rotation is simpler than introducing iss/aud/exp machinery.
5. **Worker pushes state to manager instead of manager polling** — more responsive. Rejected for MVP: manager becomes a required webhook target which couples the worker to the manager; polling keeps worker fully standalone. Can be added as an opt-in later.

## Annotations

### 2026-04-21 08:20 — Draft

Initial draft. Awaiting user approval to transition BKD coordinator to `working` and launch subtasks.
