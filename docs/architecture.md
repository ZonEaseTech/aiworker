# AIWorker Architecture

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
