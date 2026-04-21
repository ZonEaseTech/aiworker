# PLAN-003 Refactor AIWorker into a multi-worker fleet runtime

- **status**: implementing
- **createdAt**: 2026-04-21 07:00
- **approvedAt**: 2026-04-21 07:40
- **relatedTask**: REFACTOR-002

## Context

### Current state (post REFACTOR-001 / PLAN-002)

Backend (`apps/api/src/`):

- `config.ts` — single `envSchema` parse. One Brain choice via `BRAIN_PROVIDER` (`hermes` | `cloud-gateway`), one Executor via `OPENAI_*`.
- `providers/index.ts` — module-level singletons `brainProvider` and `executorProvider`; `getBrainProvider()` / `getExecutorProvider()` lazily instantiate once.
- `db/schema.ts` — six tables without any worker dimension: `sync_events`, `execution_logs`, `skill_conflicts`, `agent_tasks`, `conversations`, `messages`.
- `modules/orchestrator/service.ts` — one module-level `AsyncQueue`, one `abortControllers` map, one `runOptionsByTask` map; no worker scope.
- `modules/{skills,memory,execution,config,health,events}` — all implicitly operate on the single provider pair.

Frontend (`apps/web/src/`): seven routes bound to the implicit single worker (`/`, `/skills`, `/memory`, `/execution`, `/orchestrator`, `/config`, `/sync`).

Deployment: running on `aiwork` server (id `<aissh-server-id-redacted>`, host `<test-server-ip-redacted>`). Ubuntu 24.04, 1 CPU / 961 MiB RAM / 25 GB disk, `/opt/aiworker` source deploy via `aiworker.service` systemd unit, Caddy on `:80`, no docker installed, public URL `https://gateway.example.test`. Slated for a clean teardown before new fleet comes up.

### Driver: "aiworker" means a fleet

A worker is the whole organism — it has its **identity**, it **talks** to humans across channels, it **thinks** with Brain(s), it **learns** new skills (Hermes-style), it **acts** through Executors. The current runtime models only the "thinks + acts" pair; four layers are needed:

- **L1 Communication** — Lark / Line / Telegram / WhatsApp / Web UI channels. Webhook in, bot reply out.
- **L2 Brain** — one or more knowledge bases per worker, readable and writable.
- **L3 Evolution** — Hermes-inspired background loop that observes the worker's own traces and proposes new skills to the Brain (human-approved).
- **L4 Executor** — HTTP-based (OpenAI-compatible), MCP-based, CLI-based execution providers. OpenClaw is a first-class CLI/MCP executor.

Every worker is **isolated** from its neighbours at OS level — each one runs as a dedicated docker container with its own database, own secrets, own config, own inbound / outbound channel credentials.

### Structural mismatch against this target

1. Providers are global singletons. No per-worker config, no per-worker brain list.
2. DB rows have no worker dimension. Cross-tenant everything.
3. Orchestrator has one queue — a slow task on worker A blocks worker B.
4. No communication layer. Web is the only surface; bots do not exist.
5. No evolution layer. Skills cannot be proposed, reviewed, promoted.
6. No channel identity. A worker cannot have "its Line bot" or "its Telegram bot".
7. Process model: single Bun process on host. No isolation, no per-worker resource accounting.
8. Deploy: manual `git pull` + `systemctl restart`. Not fleet-aware.

## Proposal

### Target four-layer architecture

```
Public DNS (gateway.example.test → <test-server-ip-redacted>)
   │
   ▼
┌───────────────────────────────────────────────────────────┐
│ Caddy (TLS + path routing, already on host)                │
│                                                            │
│  /{workerId}/{channel}/webhook   →  worker-{workerId}:3001 │
│  /api/workers/{id}/*             →  worker-{workerId}:3001 │
│  /api/workers                    →  dashboard:3000         │
│  /api/system/*                   →  dashboard:3000         │
│  /app, /assets, /                →  dashboard:3000 (static)│
└─────────┬─────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────┐
│                   Docker (host daemon)                     │
│                                                            │
│ ┌─────────────────────┐                                    │
│ │ aiworker-dashboard  │   fleet.db (workers, secrets,      │
│ │ MODE=dashboard      │            audit)                  │
│ │ :3000 internal      │   Mounts /var/run/docker.sock      │
│ │                     │   Spawns worker containers         │
│ │ L0: Fleet mgmt UI   │   (supervisor)                     │
│ └─────────────────────┘                                    │
│                                                            │
│ ┌─────────────────────┐    ┌─────────────────────┐         │
│ │ aiworker-w_abc123   │    │ aiworker-w_xyz789   │    ...  │
│ │ MODE=worker         │    │ MODE=worker         │         │
│ │ :3001 internal      │    │ :3001 internal      │         │
│ │                     │    │                     │         │
│ │ L1 Channels         │    │ L1 Channels         │         │
│ │ L2 Brain(s)         │    │ L2 Brain(s)         │         │
│ │ L3 Evolution        │    │ L3 Evolution        │         │
│ │ L4 Executor         │    │ L4 Executor         │         │
│ │ Orchestrator        │    │ Orchestrator        │         │
│ │ worker.db (own vol) │    │ worker.db (own vol) │         │
│ └─────────────────────┘    └─────────────────────┘         │
└───────────────────────────────────────────────────────────┘
```

Shared docker network. Worker containers are ephemeral from the dashboard's perspective — dashboard owns the `workers` registry in `fleet.db`, provisions containers on demand, keeps secrets centrally, passes them in via environment on container start.

### Worker identity — dual ID

```typescript
interface Worker {
  id: string           // 'w_' + 12-char crockford-base32, e.g. 'w_k7hp3m2nq8fz' — IMMUTABLE
  slug: string         // human-chosen, e.g. 'support-bot' — MUTABLE
  name: string
  status: 'active' | 'paused' | 'archived'
  // ... see schema below
}
```

- `id` is the **URL token** — once a Line channel registers `https://gateway.example.test/w_k7hp3m2nq8fz/line/webhook`, that URL must never change. `id` is assigned at create time and cannot be changed thereafter.
- `slug` is the **dashboard alias** — user can rename. Used in internal paths like `/app/workers/support-bot/dashboard` (router resolves slug → id).
- All DB FKs use `id`; `slug` has a unique index but is allowed to rename.

### Two-tier database split

Workers are isolated at the container level; their data is also isolated at the database level.

**fleet.db** — mounted to dashboard container only, at `/var/lib/aiworker/fleet.db`:

```typescript
// workers — master registry
{ id: text pk, slug: text unique, name: text, description: text?,
  status: 'active' | 'paused' | 'archived',
  containerId: text?,          // docker inspect id while running
  containerImage: text,        // 'aiworker-runtime:<tag>'
  createdAt, updatedAt: text iso }

// worker_secrets — encrypted envelope store (one row per (workerId, key) pair)
{ id pk, workerId fk, key: text,        // 'brain.hermes.apiKey', 'channels.line.accessToken', ...
  valueEnc: blob,                        // AES-256-GCM(valueJson, fleetKey)
  nonce: blob, authTag: blob,
  createdAt, updatedAt: text iso,
  unique(workerId, key) }

// worker_configs — non-secret config per worker, materialized from dashboard forms
{ workerId pk fk, configJson: text,      // brains[], executor, channels[], evolution settings
  version: integer,                      // monotonic; bump on every save
  updatedAt: text iso }

// audit_events — admin actions only (who created / deleted / paused a worker)
{ id pk, at: text iso, actor: text, action: text, workerId: text?, detail: text json }
```

Secrets stored in `worker_secrets` are decrypted by the dashboard **only at the moment of spawning a worker container** and injected via `--env-file` / `--env`. Worker containers never touch `fleet.db`.

**worker.db** — mounted to each worker container at `/var/lib/aiworker/worker.db` (host volume `aiworker_data_{workerId}`):

```typescript
// Inherited and scoped. No workerId column because the whole file belongs to one worker.
agent_tasks    ({ id, prompt, status, conversationId, createdAt, finishedAt, result, channelId? })
conversations  ({ id, taskId?, channel, chatId, threadId?, status: 'open'|'closed', summary?,
                  startedAt, lastActiveAt, closedAt? })
messages       ({ id, conversationId fk, role, content, toolCalls, toolCallId, tokensIn, tokensOut, createdAt })
execution_logs ({ id, conversationId, toolName, params, result, duration, createdAt })
skill_bindings ({ id, source: 'brain'|'local', brainName?, skillName, enabled, config, priority, createdAt, updatedAt })
skill_drafts   ({ id, proposedName, source: 'evolution'|'manual', bodyMarkdown, rationale, status: 'pending'|'approved'|'rejected', createdAt, decidedAt?, decidedBy? })
evolution_observations ({ id, conversationId, kind, payload, noticedAt })
```

Cross-worker queries (e.g. "recent activity across the fleet") are answered by the dashboard aggregating from each worker's `/api/workers/:id/stats` endpoint; no direct SQL across worker.db files.

### Worker containerisation

**Single codebase, two runtime modes**:

```
apps/api/src/
├── index.ts                 # dispatches on process.env.MODE
├── modes/
│   ├── dashboard.ts         # mode=dashboard bootstrap
│   └── worker.ts            # mode=worker bootstrap
├── dashboard/               # dashboard-only modules (fleet mgmt, supervisor)
│   ├── fleet/               # workers CRUD
│   ├── supervisor/          # docker socket driver
│   ├── secrets/             # AES-GCM vault for fleet.db
│   └── audit/
├── worker/                  # worker-only modules
│   ├── channels/            # L1 — line / telegram / lark / whatsapp / web
│   ├── brain/               # L2 — registry + multi-provider routing
│   ├── evolution/           # L3 — skeleton + approval queue
│   ├── executor/            # L4 — http / mcp / cli factory
│   ├── orchestrator/        # per-worker loop
│   └── health/
├── shared/                  # http helpers, error types, request logger
├── adapters/                # existing hermes / openai / mcp, retained
└── db/
    ├── fleet/               # fleet.db schema + migrations
    └── worker/              # worker.db schema + migrations
```

**Container image**: single image `aiworker-runtime:<tag>`, entrypoint reads `MODE`. Built from one multi-stage Dockerfile in repo root. Workers and dashboard are the same image executed with different env and volume mounts.

**Dockerfile sketch** (final file will live at repo root `Dockerfile`):

```dockerfile
FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-debian AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/web build
RUN bun run --cwd apps/api build   # emits a single binary or bundle

FROM debian:12-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/api/dist /app
COPY --from=build /app/apps/web/dist /app/web
ENV NODE_ENV=production
EXPOSE 3000 3001
ENTRYPOINT ["/usr/bin/tini", "--", "/app/index.mjs"]
```

Both modes use port 3000 (dashboard) or 3001 (worker) — chosen per `MODE`.

### Fleet supervisor (inside dashboard)

`apps/api/src/dashboard/supervisor/` owns a thin wrapper over dockerode (or direct Docker HTTP API via `/var/run/docker.sock`):

```typescript
class FleetSupervisor {
  create(input: CreateWorkerInput): Promise<Worker>         // generate id, store secrets, spawn container
  start(workerId: string): Promise<void>                    // docker start
  stop(workerId: string): Promise<void>                     // SIGTERM → wait → SIGKILL
  remove(workerId: string): Promise<void>                   // stop + rm -v (deletes worker.db volume)
  inspect(workerId: string): Promise<ContainerInspect>      // live status + resource usage
  logs(workerId: string, opts): AsyncIterable<string>       // docker logs -f
  restart(workerId: string): Promise<void>
}
```

Container spawn recipe:

```
docker run -d \
  --name aiworker-{workerId} \
  --network aiworker_default \
  --label aiworker.role=worker \
  --label aiworker.workerId={workerId} \
  --restart unless-stopped \
  --memory=256m --cpus=0.5 \
  -e MODE=worker \
  -e WORKER_ID={workerId} \
  -e WORKER_CONFIG_VERSION={version} \
  --env-file <(tempfile-with-decrypted-secrets) \
  -v aiworker_data_{workerId}:/var/lib/aiworker \
  aiworker-runtime:{tag}
```

Secrets pass through an ephemeral env-file that is unlinked immediately after `docker run` returns. The worker process reads its env at boot and never needs to re-fetch.

### Config reload

When user updates a worker's config in the dashboard:

1. Dashboard persists new `worker_configs.configJson` with `version++`.
2. Dashboard `POST http://aiworker-{workerId}:3001/api/internal/reload` (internal-only endpoint, authenticated by shared network secret).
3. Worker pulls fresh config (non-secret parts) and re-instantiates Brain/Executor/Channel registries.
4. On secret changes, worker restart required (supervisor handles).

### Reverse proxy (Caddy)

Existing Caddy on host. `/etc/caddy/Caddyfile`:

```
gateway.example.test {
  # Worker webhooks and scoped API
  @worker path_regexp worker ^/(w_[0-9a-z]+)(/.*)?$
  handle @worker {
    reverse_proxy aiworker-{re.worker.1}:3001
  }

  @workerApi path_regexp workerApi ^/api/workers/(w_[0-9a-z]+)(/.*)$
  handle @workerApi {
    rewrite * /api/worker{re.workerApi.2}
    reverse_proxy aiworker-{re.workerApi.1}:3001
  }

  # Dashboard fleet ops + UI
  handle {
    reverse_proxy aiworker-dashboard:3000
  }

  tls admin@jbcnet.co.jp
}
```

Caddy resolves `aiworker-{workerId}` via the shared docker bridge network DNS. No Caddy reload needed when adding/removing workers.

### L1 — Communication layer

`apps/api/src/worker/channels/`:

```
channels/
├── index.ts            # registry + envelope type
├── routes.ts           # POST /{channel}/webhook (workerId already resolved by container identity)
├── envelope.ts         # normalized message: { channel, chatId, userId, text, attachments, raw }
├── adapters/
│   ├── line.ts         # @line/bot-sdk friendly — signature verify + event dispatch
│   ├── telegram.ts     # telegram-bot-api style
│   ├── lark.ts         # larksuite/node-sdk style
│   ├── whatsapp.ts     # Meta Cloud API webhook format
│   └── web.ts          # internal: dashboard chat widget → same envelope
```

Inbound pipeline:

```
POST /{channel}/webhook
  ↓
Adapter.verify(req)                  # signature check
  ↓
Adapter.toEnvelope(req)              # normalize
  ↓
ConversationRouter.resolve(envelope) # agent-decided continuation (see §Conversation)
  ↓
Orchestrator.enqueue(workerId, conversationId, envelope)
  ↓
Respond 200 to platform immediately (bot replies async via outbound path)
```

Outbound: orchestrator emits events; channel adapter formats + POSTs to platform's reply API using credentials from worker env.

**MVP channel scope**:
- Fully wired: `web` (dashboard chat widget) + `line` (user's stated example).
- Skeleton + TODO: `telegram`, `lark`, `whatsapp`. Each has the adapter file with `verify()` and `toEnvelope()` raising `NotImplementedError`; schema in place. Tracked via FEAT-003/-004/-005 placeholders — see Future Work.

### L2 — Brain layer (multi-source per worker)

Worker config shape:

```typescript
interface BrainSourceConfig {
  id: string                                     // 'main-kb', 'notes', ...
  type: 'hermes' | 'cloud-gateway'
  readOnly: boolean                              // if true, writeMemory proxies to another source
  config: HermesConfig | CloudGatewayConfig
  priority: number                               // for retrieval merging
}
interface BrainRegistry {
  sources: BrainSourceConfig[]
  writeTarget: string                            // id of the source that receives writeMemory()
  retrieval: 'merge-by-priority' | 'first-match'
}
```

Existing `HermesProvider` + `CloudGatewayBrainProvider` are retained and moved under `apps/api/src/worker/brain/providers/`. A new `MultiBrainProvider` wraps the list and implements the existing `BrainProvider` interface, so Orchestrator sees one brain regardless of how many are mounted.

### L3 — Evolution layer (skeleton in MVP)

```
evolution/
├── observer.ts         # listens to orchestrator events, records structured observations
├── proposer.ts         # STUB in MVP — periodically scans recent observations and (eventually) drafts skills
├── approval.ts         # skill_drafts CRUD: list, approve → write to Brain, reject
└── routes.ts           # /api/worker/evolution/{observations,drafts}
```

In MVP:
- Observer runs and writes `evolution_observations` rows.
- `skill_drafts` table exists with approval flow.
- Proposer is a **no-op scheduled job** that logs "would analyse N observations here". The intelligence of drafting is tracked as future work (see Future Work §).
- Dashboard shows observations + an empty drafts pane so the plumbing is visible.

This isolates the Evolution L3 build-out from the fleet refactor: when the generator is built later, plug it into `proposer.ts` and everything else is already in place.

### L4 — Executor layer (http / mcp / cli)

```typescript
type ExecutorConfig =
  | { type: 'http'; baseUrl: string; apiKey: string; model: string; timeoutMs: number }    // OpenAI-compatible
  | { type: 'mcp'; url: string; token: string; tools: string[] }                            // MCP streamable-http
  | { type: 'cli'; command: string; args: string[]; cwd?: string; env?: Record<string,string>; sandbox?: boolean }
```

Factory at `apps/api/src/worker/executor/factory.ts` returns an `ExecutorProvider` implementation per type. The existing `OpenAICompatibleExecutor` + MCP client are retained and slot into `http` and `mcp` branches. New `CliExecutor` spawns the configured process (OpenClaw is the canonical example: `openclaw` binary invoked per tool call, stdin JSON in / stdout JSON out).

The `sandbox: true` flag on `cli` is a **forward-looking** hook — when set, `CliExecutor` wraps `docker run --rm --network=none ...`. In MVP we implement the plain spawn path; sandbox wrapping is tracked under FEAT-002.

### Conversation boundary — Agent-driven, no timeouts

No idle timer, no `/reset` magic word. Before every inbound message:

```typescript
// worker/channels/conversation-router.ts
async function resolve(envelope: Envelope): Promise<{ conversationId: string; isNew: boolean }> {
  const candidate = await findMostRecentOpenConversation(envelope.channel, envelope.chatId, envelope.threadId)
  if (!candidate) return createNew(envelope)

  const decision = await classify({
    priorSummary: candidate.summary,
    recentMessages: await lastNMessages(candidate.id, 4),
    incoming: envelope.text,
  })
  // classify() calls the worker's own executor in a lightweight, low-temperature mode:
  //   system: 'Decide if the new message continues the prior conversation or opens a new topic.
  //           Respond JSON {"continue": boolean, "reason": string}.'

  if (decision.continue) return { conversationId: candidate.id, isNew: false }
  await closeConversation(candidate.id)
  return createNew(envelope)
}
```

Advantages:
- No hardcoded thresholds that would mis-segment natural conversations.
- The worker's own brain + executor evaluate topic continuity.
- Cost: one short classifier call per inbound message. Cheap with a small model; can short-circuit (skip classifier) when the previous message was < N seconds ago AND channel is 1-on-1 — **this optimisation is deferred**; MVP runs classifier on every inbound message.

### URL map (final)

Public (outside consumers):

```
POST  https://gateway.example.test/{workerId}/line/webhook
POST  https://gateway.example.test/{workerId}/telegram/webhook
POST  https://gateway.example.test/{workerId}/lark/webhook
POST  https://gateway.example.test/{workerId}/whatsapp/webhook
GET   https://gateway.example.test/{workerId}/web/chat      (optional iframe-embed chat widget)
```

Dashboard operator surface:

```
GET|POST|PATCH|DELETE  /api/workers                              # dashboard container
GET                    /api/workers/:id                          # dashboard container
POST                   /api/workers/:id/start|stop|restart       # dashboard → supervisor
GET                    /api/workers/:id/logs                     # dashboard → supervisor
GET                    /api/workers/:id/skills                   # worker container (proxied by Caddy)
GET                    /api/workers/:id/memories                 # worker container
GET                    /api/workers/:id/orchestrator/tasks       # worker container
POST                   /api/workers/:id/orchestrator/tasks       # worker container
GET                    /api/workers/:id/channels                 # worker container
PATCH                  /api/workers/:id/channels/:channel        # worker container (mutates config + reload)
GET                    /api/workers/:id/evolution/observations   # worker container
GET                    /api/workers/:id/evolution/drafts         # worker container
POST                   /api/workers/:id/evolution/drafts/:id/{approve,reject}  # worker container
GET                    /api/workers/:id/events/stream            # worker container SSE
GET                    /api/system/health                        # dashboard + supervisor view
```

Internal (container-to-container):

```
POST  http://aiworker-{workerId}:3001/api/internal/reload
GET   http://aiworker-{workerId}:3001/api/internal/ready
```

All internal routes require header `X-AIWorker-Internal: <sharedSecretFromDashboardEnv>`.

### Frontend restructure

TanStack Router tree:

```
/                                 Workers list (cards: status, channel count, last activity)
/workers/new                      Create wizard (steps: basics → brain → executor → channels)
/workers/:slug                    redirect → /workers/:slug/dashboard
/workers/:slug/dashboard          Live status, recent activity feed, SSE
/workers/:slug/channels           Channel bindings (enable/edit/test webhook)
/workers/:slug/skills             Skill bindings editor (brain skills + local)
/workers/:slug/memory             Memory explorer
/workers/:slug/execution          Execution log
/workers/:slug/orchestrator       Task list + replay
/workers/:slug/evolution          Observations + skill drafts approval queue
/workers/:slug/config             Brain sources + executor config + env
/settings                         System settings (fleet-wide, minimal — backup, version)
```

Worker switcher appears in header whenever `/workers/:slug/*` is active. All existing `features/*` components are refactored to accept `workerId` and scope their queries.

### Secret management

- Dashboard has `AIWORKER_MASTER_KEY` env (32-byte hex). Used to AES-GCM-encrypt every row in `worker_secrets`. Dashboard refuses to start if missing.
- Worker containers receive their secrets **as environment variables**, decrypted at spawn time by the dashboard. No secret ever lives on disk inside a worker container — `.env` files are not generated.
- Dashboard audit log records every secret read (e.g. on container start), never the value.

### Removal of existing single-process runtime

Per user direction: the `/opt/aiworker` deployment is torn down before the first fleet deploy.

```
aissh exec <server> "systemctl stop aiworker && systemctl disable aiworker"
aissh exec <server> "rm -rf /opt/aiworker /etc/systemd/system/aiworker.service"
aissh exec <server> "systemctl daemon-reload"
```

No data migration — fresh install of the fleet runtime. Any needed fleet bootstrap (default worker) is a user-initiated action through the dashboard after first boot.

### Execution plan (BKD-coordinated subtasks)

Each row below maps to one BKD subtask. Phase 7 is deferred per user and tracked separately.

| # | Phase | Scope |
|---|---|---|
| 1 | Shared | `packages/shared` additions: `Worker`, `WorkerConfig`, `ChannelBinding`, `Envelope`, `BrainSourceConfig`, `ExecutorConfig` discriminated union, `ConversationDecision`, `SkillDraft`, `EvolutionObservation`. |
| 2 | Schema | DB split: `apps/api/src/db/fleet/` (workers, worker_secrets, worker_configs, audit_events) + `apps/api/src/db/worker/` (existing tables scoped per worker + skill_bindings + skill_drafts + evolution_observations). Drizzle migrations for both; destructive reset of existing `aiworker.db`. |
| 3 | Secrets | `apps/api/src/dashboard/secrets/` AES-256-GCM vault. `AIWORKER_MASTER_KEY` env gate. Unit tests cover encrypt/decrypt and missing-key refusal. |
| 4 | Dashboard core | `MODE=dashboard` entrypoint. Fleet CRUD (`/api/workers`) + config editor. `FleetSupervisor` over docker socket with spawn / start / stop / remove / inspect / logs. Dashboard UI shell (routes list/new/dashboard/settings) with empty per-worker pages. |
| 5 | Worker core | `MODE=worker` entrypoint. `WorkerRegistry` constructs Brain(s) + Executor + Channel adapters from env + config. Internal routes (`/api/internal/reload`, `/ready`). `worker.db` initialized per container. |
| 6 | Orchestrator per-worker | Per-container queue + conversation-classifier preprocessing + tool loop (retained from current orchestrator). Agent-decided continuation implemented; no timeouts. |
| 7 | Channel framework | `worker/channels/` envelope + adapter registry. **Working**: `web` (internal chat widget), `line` (full webhook verify + reply). **Skeleton**: `telegram`, `lark`, `whatsapp`. |
| 8 | Brain multi-source | `MultiBrainProvider` wrapping existing `HermesProvider` + `CloudGatewayBrainProvider`. Per-worker config drives source list + write target. |
| 9 | Executor factory | `http` / `mcp` / `cli` factory. Retain existing OpenAI-compatible + MCP adapters. Implement `CliExecutor` (plain spawn; sandbox flag reserved). |
| 10 | Evolution skeleton | Observer hooks into orchestrator events. `skill_drafts` CRUD + dashboard approval UI. Proposer is a no-op logger. |
| 11 | Dashboard UI — per-worker | Port existing web features under `/workers/:slug/*` with `workerId`-scoped queries. Channels page, evolution page, worker switcher. Workers list + create wizard. |
| 12 | Docker image + local dev | `Dockerfile` + `docker-compose.yml` for local dev (dashboard + 1 seed worker). `bun run dev` equivalent that uses compose-up under the hood. |
| 13 (deferred) | Deployment | Caddyfile template, aissh-driven deploy script, remote teardown of old `/opt/aiworker`, migration notes. Tracked separately — see Future Work. |

Each subtask runs `bun run typecheck` + `bun run lint` + focused tests before reporting. `pma-cr` pass precedes every merge. Worktree-isolated where parallelizable.

## Risks

1. **Resource pressure on `gateway.example.test` host** (1 CPU / 961 MiB). Three workers ≈ 200 MiB RAM; beyond that swap pressure begins. Mitigation: dashboard exposes RAM/CPU per worker; alert when container RSS > 200 MiB; operator can pause or upgrade.
2. **Docker socket in dashboard = root equivalent on host**. Mitigation: dashboard only exposes supervisor endpoints to the authenticated operator; Caddy does not expose `/api/internal/*`; audit every supervisor action.
3. **Classifier cost on every inbound message**. Mitigation: cheap model (gpt-4o-mini default), low max_tokens, short prompt; observable in stats per worker.
4. **Single host, no fleet HA**. Mitigation: accept for MVP; when fleet grows, point a second docker host at the same shared network (requires overlay network — future work).
5. **Caddy regex-based upstream resolution**. Mitigation: Caddy's path matcher + docker DNS is well-trodden; write a smoke test covering `/{workerId}/...` routing against a dummy backend.
6. **`worker.db` volume lifecycle**. Destroying a worker container must not destroy its data unless operator asks. Mitigation: `POST /api/workers/:id/delete` prompts for `deleteData?: boolean`; default false; supervisor only removes the volume when flag is true.
7. **Channel webhook signature drift**. Each platform evolves its signature scheme. Mitigation: adapter-per-channel isolates blast radius; adapter contract test against recorded real payloads for Line and Web in MVP.
8. **Shared codebase / dual-mode binary** could leak worker-mode code into dashboard or vice versa. Mitigation: `modes/dashboard.ts` and `modes/worker.ts` are the only importers of their respective subdirectories; lint rule forbids cross-imports.
9. **Destructive teardown of `/opt/aiworker`** cannot be undone after remove. Mitigation: explicit aissh approval gate; operator reviews diff first.

## Scope

- **Backend new**: ~3500 LOC (dashboard fleet + supervisor + 2 DB schemas + worker channels/brain/executor/orchestrator refactor + evolution skeleton + secrets vault).
- **Backend deletions**: ~700 LOC (singletons, env-only config paths, legacy OpenClaw WS remnants).
- **Shared**: ~500 LOC (new types).
- **Frontend**: ~2000 LOC (workers list + create wizard + per-worker nested routes + channels page + evolution page + switcher + feature refactors).
- **Ops**: ~400 LOC (Dockerfile, docker-compose, Caddyfile template — the last one deferred).
- **DB**: two fresh schemas; destructive migration from current single-DB state.
- **Subtasks**: 12 in this plan (+1 deferred deploy subtask tracked elsewhere).

Deliverables when complete:

- `bun run dev` spins up dashboard + one empty worker container locally.
- Operator creates Worker A (Hermes brain + OpenAI-compat executor + Web channel) and Worker B (cloud-gateway brain + OpenClaw CLI executor + Line channel); each gets a stable `w_*` ID.
- Inbound Line message to `https://gateway.example.test/w_xxx/line/webhook` reaches worker B, classifier decides conversation continuation, orchestrator runs the loop, brain records the exchange, bot replies on Line.
- Dashboard shows live fleet state, per-worker channel list, per-worker memory, per-worker skill-draft queue (empty until L3 generator lands).

## Alternatives

1. **Single process + logical scoping** (my earlier draft) — ~40% less code, no docker, same server. Rejected per user: physical isolation (worker-per-container) is the chosen posture.
2. **Per-worker SQLite in a shared dashboard process** — gains isolation at DB layer without container overhead. Rejected: user wants container-level isolation; mixing process + DB boundaries adds confusion.
3. **Kubernetes / nomad on a single host** — proper orchestration. Rejected: docker daemon is sufficient at current fleet size, k8s overhead not justified.
4. **Firecracker microVMs per worker** — stronger isolation than docker. Rejected: vastly more complex, no concrete threat justifies it.
5. **Channel relay via a single shared bot process** (one Line account fanning out to workers) — simpler but loses per-worker identity. Rejected per user: each worker has its own identity on each channel.
6. **Shared executor pool across workers** — cheaper if all workers use same OpenAI key. Rejected: breaks isolation + per-worker rate limits + per-worker billing visibility.

## Future Work (explicitly deferred, tracked to avoid loss)

These are out of MVP scope but architecturally anticipated. Each gets a pending task in `docs/task/index.md` so we do not forget.

- **FEAT-002 Executable skills runtime (sandbox)** — skills beyond declarative; `cli` executor with `sandbox: true` wrapped in a one-shot docker runtime. Approval gates + permission model + skill package format.
- **FEAT-003 Telegram channel adapter** — full implementation behind the stub.
- **FEAT-004 Lark channel adapter** — full implementation behind the stub.
- **FEAT-005 WhatsApp (Meta Cloud API) channel adapter** — full implementation behind the stub.
- **FEAT-006 Evolution generator** — the actual pattern-miner → draft-skill loop. Observer and approval schema land now; intelligence lands here.
- **FEAT-007 M:1 channel routing** — one chat (e.g. a Lark group) routed to multiple workers with @mention dispatch. Current design is 1:N (one worker : many channels); inverse case needs a channel-level router.
- **FEAT-008 Host-level HA / multi-host fleet** — overlay network, distributed supervisor, worker migration.
- **FEAT-009 Deployment automation** — aissh-driven deploy of the fleet image + Caddyfile template + clean teardown of the legacy `/opt/aiworker`. Deferred on user instruction; listed here so it is not lost.

## Annotations

### 2026-04-21 07:00 — Initial draft

First version scoped only around "multi-worker with brain + executor" (single process, logical scoping). Superseded.

### 2026-04-21 07:30 — Revised to four-layer fleet

User clarified during brainstorming:

- Framework has four layers: **Communication** (bots) + **Brain** (multi-KB) + **Evolution** (Hermes-style skill self-learning) + **Executor** (HTTP / MCP / CLI, OpenClaw as reference CLI).
- Every worker has its own identity. Line group registers `https://.../{workerId}/line/webhook` — `workerId` is a first-class URL citizen.
- Worker-per-container (docker).
- Skills: declarative in MVP; executable skills deferred with explicit tracking.
- Conversation boundary: Agent decides, no hardcoded timeouts or reset words.
- workerId is short immutable token + mutable slug.
- Current `/opt/aiworker` on `gateway.example.test` (<test-server-ip-redacted>) to be torn down; deploy flow tracked separately.

Plan rewritten accordingly. Deployment work deferred to Future Work FEAT-009 per user instruction.
