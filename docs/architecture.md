# AIWorker Architecture

## Monorepo Layout

```text
apps/
  api/          # Hono HTTP server (dashboard + worker modes)
  cli/          # aiw CLI — conversation loop without binding HTTP
  web/          # React 19 SPA served by the dashboard mode
packages/
  shared/          # cross-layer types / constants / zod schemas
  storage-sqlite/  # fleet.db + worker.db schemas, drizzle configs, migrations
  fs-layout/       # ~/.aiworker/ path resolver + ensureWorkerHome bootstrap
```

- **`apps/api`** exposes two surfaces: the default `.` export (legacy dev entry) and a `./lib` subpath export so CLI + scripts can reach into the runtime without starting a Hono server. PLAN-015 will hoist most of the worker subtree into a new `packages/core`.
- **`apps/cli`** depends on `@aiworker/api/lib` + `@aiworker/storage-sqlite` + `@aiworker/fs-layout`; its subcommands (`aiw init / run / serve / config-show / config-set / token-rotate`) drive the exact same bootstrap sequence as `AIWORKER_MODE=worker`. See `docs/cli.md`.
- **`packages/storage-sqlite`** is the single source of truth for the two SQLite databases. It exports subpaths `./fleet` and `./worker` to keep the data-domain boundary narrow, and re-exports `defaultFleetMigrationsFolder` / `defaultWorkerMigrationsFolder` resolved via `import.meta.url` so consumers never hardcode `./drizzle/...` paths.
- **`packages/fs-layout`** owns the per-worker home directory layout (see below). Both `apps/api` (identity bootstrap, config mirror) and `apps/cli` (config lookups, future gateway client) resolve paths through it, so the layout can evolve without touching every consumer.

## Filesystem source of truth (PLAN-012)

Each worker owns a directory tree under `AIWORKER_HOME` (default `~/.aiworker`):

```text
~/.aiworker/workers/<workerId>/
  AGENT.md         # persona / role doc — orchestrator may inject into system prompt
  SOUL.md          # voice + style guide
  USER.md          # user profile the agent maintains over time
  config.yaml      # redacted worker config mirror (advisory; DB stays authoritative)
  brain/
    MEMORY.md      # human-readable memory index
    memories/*.md  # individual memory notes (agent-created + hand-edited)
    skills/<n>/SKILL.md  # agentskills.io-compatible skills
  worker.db        # SQLite identity + FTS + runtime state
  workspaces/      # per-conversation ephemeral workspaces
```

- **Skills + memories** are read/written through `FilesystemBrainProvider` (class renamed from `HermesProvider` in PLAN-012). The provider treats the filesystem as authoritative; SQLite holds only identity + transient runtime state + (future) FTS indexes.
- **`config.yaml`** is an advisory mirror of `worker_config.configJson`. `PUT /api/worker/config` and `aiw config-set` both call `mirrorConfigToYaml` after the DB write. The DB remains authoritative because the optimistic-lock contract (`If-Match: <version>`) depends on it. Moving yaml to source-of-truth is deferred to a later plan once WS gateway + `aim config edit` land.
- **`AGENT.md` / `SOUL.md` / `USER.md`** are seeded as stubs on first boot. The orchestrator does not yet inject them into the system prompt — that behaviour lands alongside the prompt-assembly changes in PLAN-014.
- **`ensureWorkerHome(workerId)`** is called from `loadOrMintIdentity` (both the existing + just-minted paths) so a freshly wiped tmpdir always has the expected skeleton by the time the runtime boots.

## Overview

AIWorker is a **self-hosted Agent Runtime** that composes two pluggable providers:

- **Brain provider** — knowledge base, memory store, skill catalogue. Current implementation: `HermesProvider` (Hermes filesystem + API).
- **Executor provider** — chat completions with tool calling over an OpenAI-compatible endpoint. Current implementation: `OpenAICompatibleExecutor`.

The **Orchestrator** drives the agent loop (submit prompt → stream completions → execute tools → persist transcript → emit SSE events). Everything else (REST surface, SSE stream, web UI) is built on top of this core.

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend (Web)                 │
│         React 19 + Vite 8 + TanStack            │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Dashboard│ │ Skills   │ │ Memory Explorer  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Execution│ │ Config   │ │ Sync Status      │ │
│  │ Monitor  │ │ Editor   │ │                  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────────────────────────┐   │
│  │ Orchestrator (task list + replay + SSE) │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ REST + SSE
                       ▼
┌──────────────────────────────────────────────────┐
│              Backend API (Bun + Hono)            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Orchestrator                     │  │
│  │  submit → loop(stream → tool → persist)    │  │
│  │  queue · cancel · SSE broadcast            │  │
│  └──────────────────┬─────────────────────────┘  │
│                     │                            │
│  ┌──────────────────┴─────────────────────────┐  │
│  │           Module Layer                     │  │
│  │  ┌────────┐ ┌────────┐ ┌─────────┐ ┌────┐ │  │
│  │  │ Skills │ │ Memory │ │Execution│ │... │ │  │
│  │  └────────┘ └────────┘ └─────────┘ └────┘ │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Provider Interfaces              │  │
│  │  ┌───────────────┐  ┌────────────────────┐ │  │
│  │  │ BrainProvider │  │ ExecutorProvider   │ │  │
│  │  │ ─ HermesProv. │  │ ─ OpenAICompatible │ │  │
│  │  └───────────────┘  └────────────────────┘ │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  SQLite (Drizzle) — tasks, conversations,  │  │
│  │  messages, execution_logs, skill_conflicts │  │
│  └────────────────────────────────────────────┘  │
└────────┬───────────────────────────────┬─────────┘
         │                               │
         ▼                               ▼
┌─────────────────┐           ┌────────────────────────┐
│  Hermes Agent   │           │  OpenAI-compatible API │
│                 │           │                        │
│ ~/.hermes/      │           │  Any endpoint that     │
│  ├── skills/    │           │  speaks Chat           │
│  ├── memories/  │           │  Completions + tools   │
│  └── config.yaml│           │  (OpenAI, Ollama,      │
│ API: :8642      │           │  vLLM, LM Studio, …)   │
└─────────────────┘           └────────────────────────┘
```

## Layered Responsibilities

### Orchestrator (`apps/api/src/modules/orchestrator`)

Coordinates the agent loop for a single task:

1. `submitTask` inserts a row in `agent_tasks` (status `queued`) and enqueues `runTask` on a FIFO queue.
2. `runTask` materialises a `conversations` row, builds a system prompt from Brain-listed skills, and begins streaming from the Executor.
3. On each `tool_call` chunk, the orchestrator routes to `executeTool` (`search_memory`, `write_memory`, `read_file`) against the Brain provider / `HERMES_HOME`, persists the call to `execution_logs`, and appends the result to the transcript.
4. Terminal states (`succeeded` / `failed` / `cancelled`) finalise `agent_tasks.finishedAt` and, when enabled, auto-writeback the final assistant message as a new memory.
5. Every state transition publishes `orchestrator.task.*` events onto `eventBus`, which the SSE endpoint forwards to connected UIs.

### Provider Interfaces (`packages/shared`)

| Interface | Responsibility | Current implementation |
|-----------|----------------|------------------------|
| `BrainProvider` | list/search/write memories, list skills, watch for changes, health | `HermesProvider` — Hermes filesystem + HTTP API |
| `ExecutorProvider` | stream chat completions with tool calling, expose available tools, health | `OpenAICompatibleExecutor` — POSTs to `${OPENAI_BASE_URL}/v1/chat/completions` with SSE streaming |

Swap either by implementing the interface and wiring it in `apps/api/src/providers/index.ts`.

#### Executor engines (FEAT-011 → FEAT-016)

PLAN-007 turned `ExecutorProvider` into a registry keyed by `EngineKind`. Each engine lives under `apps/api/src/worker/executor/engines/*` (or `providers/*` for the original HTTP/MCP/CLI shims) and emits engine-agnostic `AgentEvent`s:

- `http` — OpenAI-compatible chat completions (FEAT-011 baseline, serving HTTP/DeepSeek/SiliconFlow/OpenRouter variants)
- `mcp` — Model Context Protocol streamable-http tool source
- `cli` — generic one-shot CLI stub (debug / sandbox)
- `claude-code` — `claude` CLI in stream-json mode with control protocol (FEAT-012)
- `acp` — Agent Client Protocol harness over JSON-RPC/stdio, ships Gemini + Qwen adapters (FEAT-013)
- `codex` — `@openai/codex app-server` over JSON-RPC/stdio, `approval_policy: 'never'` for auto-approve (FEAT-016)
- `cursor` — `cursor-agent -p --output-format=stream-json`, no npm fallback — PATH install required (FEAT-016)

### Module Layer

| Module | Responsibility |
|--------|---------------|
| `skills` | Skill catalogue, diff, conflict records (`skill_conflicts.brain_hash` / `executor_hash`) |
| `memory` | Read-through / search Brain memories; write back via the provider |
| `execution` | Execution log query surface; writes originate from the orchestrator tool path |
| `config` | Unified read/write for Hermes YAML; legacy OpenClaw config is no longer surfaced |
| `health` | Aggregates `services.brain` + `services.executor` status |
| `events` | In-process event bus + `/api/events/stream` SSE endpoint |
| `orchestrator` | Task lifecycle + tool loop (see above) |

### Data Flow

```
Client ─ POST /api/orchestrator/tasks ─▶ Orchestrator
                                         │
                                         ├─▶ Executor.runChat (stream)
                                         │      ├─ text delta   → persist assistant message
                                         │      ├─ tool_call    → Brain.searchMemory / writeMemory / fs.read
                                         │      └─ finish       → finalise task
                                         │
                                         └─▶ eventBus ─▶ SSE /api/events/stream ─▶ UI
```

## Environment

See `apps/api/.env.example` for the full list. Required for live runs:

- `HERMES_API_URL`, `HERMES_HOME` — Brain provider target
- `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS` — Executor provider target

Legacy `OPENCLAW_WS_URL` / `OPENCLAW_HOME` remain in the env schema for transitional compatibility; they are not consumed by the current orchestrator or surfaced via `/api/config`.

## Key Design Decisions

1. **Provider-shaped core**: the orchestrator depends only on `BrainProvider` / `ExecutorProvider`, not on Hermes or OpenAI specifically. Tests inject scripted executors; production swaps via `apps/api/src/providers/index.ts`.
2. **File-first for Brain**: memories and skills live as markdown files under `HERMES_HOME`; the provider wraps filesystem + optional HTTP.
3. **SQLite for runtime state**: agent tasks, conversations, transcripts, tool-call logs, and skill conflicts. Drizzle migrations run automatically on `initDb`.
4. **SSE for live updates**: the orchestrator publishes typed events; the web app subscribes via `/api/events/stream` for dashboard, execution monitor, and orchestrator pages.
5. **OpenAI-compatible, not OpenAI-only**: any endpoint speaking the chat-completions + tools dialect works (OpenAI, Ollama, vLLM, LM Studio, Together, …).
