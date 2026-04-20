# PLAN-002 Refactor AIWorker into self-hosted Agent Runtime

- **status**: implementing
- **createdAt**: 2026-04-20 17:40
- **approvedAt**: 2026-04-20 18:05
- **relatedTask**: REFACTOR-001

## Context

### Existing assets (from PLAN-001, completed)

Backend (`apps/api/src/`):

- `adapters/hermes/` — `api-client.ts`, `fs-scanner.ts`, `watcher.ts`, `types.ts`, `index.ts` (exports `HermesAdapter`)
- `adapters/openclaw/` — `ws-client.ts`, `event-logger.ts`, `config-reader.ts`, `skill-scanner.ts`, `types.ts`, `index.ts` (exports `OpenClawAdapter`)
- `modules/health` — service status for Hermes + OpenClaw + self
- `modules/skills` — scan/diff/sync between the two sides, conflict tracking
- `modules/memory` — read/search/write memories via `scanMemories` directly on Hermes FS
- `modules/execution` — passive query over `executionLogs` populated by OpenClaw WS events
- `modules/config` — read/write Hermes YAML and OpenClaw JSON config files
- `modules/events` — SSE stream
- `db/schema.ts` — `sync_events`, `execution_logs`, `skill_conflicts`
- `config.ts` — env schema: `HERMES_API_URL`, `HERMES_HOME`, `OPENCLAW_WS_URL`, `OPENCLAW_HOME`

Frontend (`apps/web/src/`):

- Six routes (`index`, `skills`, `memory`, `execution`, `config`, `sync`) with matching `features/` folders
- TanStack Router + Query, Tailwind v4, Base UI primitives

Shared (`packages/shared/src/`):

- `types.ts` — only four bare interfaces (`ServiceStatus`, `SkillMeta`, `MemoryEntry`, `ExecutionEvent`); no provider abstraction yet

### Structural problems for the new positioning

1. Modules import adapters directly (e.g. `memory/service.ts` calls `scanMemories` on `adapters/hermes/fs-scanner`). There is no Brain seam.
2. `OpenClawAdapter` is a passive WS listener; there is no active executor that the runtime can drive.
3. No LLM call path anywhere in the repo — OpenAI-compatible HTTP client, chat loop, tool-calling schema, all missing.
4. No orchestrator — nothing ties brain lookups to executor calls to memory write-back.
5. `execution_logs` records single tool calls, not conversations — inadequate for an agent loop.
6. Skills sync semantics ("Hermes ↔ OpenClaw") no longer make sense; the correct semantic is "Brain skill registry ↔ Executor skill registry".

### Research findings

- OpenAI-compatible endpoints (OpenAI / Azure / vLLM / LiteLLM / Ollama) all speak `/v1/chat/completions` with tool-calling payloads. A single typed client covers the full target surface.
- Existing `adapters/hermes/*` already exposes memory/skill scanning and API client — it can be wrapped into a `BrainProvider` without rewriting.
- `OpenClawAdapter`'s WS client and event logger have no forward value in the new world (no process to listen to). The skill scanner logic can be retargeted to a local "executor skills" directory (managed by aiworker itself), or dropped.

## Proposal

### Layered architecture

```
┌────────────────────────────────────────────────────┐
│  Orchestrator (new module)                         │
│  task queue → brain lookup → executor loop →       │
│  write-back to brain (iteration)                   │
└───────────────┬─────────────────┬──────────────────┘
                │                 │
       ┌────────▼──────┐   ┌──────▼──────────────┐
       │ BrainProvider │   │ ExecutorProvider    │
       │ (interface)   │   │ (interface)         │
       └────────┬──────┘   └──────┬──────────────┘
                │                 │
       ┌────────▼────────┐  ┌─────▼──────────────────┐
       │ HermesProvider  │  │ OpenAICompatible-      │
       │ (adapters/      │  │ Executor               │
       │  hermes/*)      │  │ (adapters/openai/*)    │
       └─────────────────┘  └────────────────────────┘
```

### `packages/shared/src/providers/` — new

```typescript
// brain.ts
export interface BrainProvider {
  readonly name: string
  health(): Promise<{ ok: boolean; detail?: string }>
  listSkills(): Promise<BrainSkill[]>
  listMemories(filter?: MemoryFilter): Promise<BrainMemory[]>
  searchMemories(query: string): Promise<BrainMemory[]>
  writeMemory(input: WriteMemoryInput): Promise<{ id: string }>
  watch?(handler: (event: BrainWatchEvent) => void): () => void
}

// executor.ts
export interface ExecutorProvider {
  readonly name: string
  health(): Promise<{ ok: boolean; detail?: string }>
  listTools(): ExecutorTool[]  // tools the executor exposes to the model
  runChat(input: ChatRunInput): AsyncIterable<ChatStreamChunk>
}

// orchestrator.ts
export interface AgentTask {
  id: string
  prompt: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  conversationId?: string
  createdAt: string
  finishedAt?: string
}
export interface ChatMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCalls?: ToolCall[]; toolCallId?: string }
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }
```

Exports from `packages/shared/src/index.ts` extended accordingly; existing four interfaces kept (re-exported) for backward compatibility during migration.

### `apps/api/src/providers/` — new directory

- `brain/hermes.ts` — `class HermesProvider implements BrainProvider`, composes `HermesApiClient` + `fs-scanner` + `HermesWatcher` from existing `adapters/hermes/`.
- `executor/openai-compatible.ts` — `class OpenAICompatibleExecutor implements ExecutorProvider`. Uses `fetch` against `{baseUrl}/v1/chat/completions` with streaming + tool calling. No new dependencies; `zod` for validation.
- `adapters/openai/` — low-level HTTP/SSE client split out of the executor for testability.

### `apps/api/src/modules/` — refactor in place

- `health/` — check `brainProvider.health()` and `executorProvider.health()` instead of Hermes/OpenClaw directly.
- `memory/` — replace `scanMemories(config.HERMES_HOME)` with `brainProvider.listMemories()` etc. Behavior preserved for the default `HermesProvider`.
- `skills/` — replace the "Hermes vs OpenClaw" diff with "brain skills vs executor-registered skills". `sync.ts` retains the diff algorithm; data sources swap.
- `execution/` — keep list/get/stats API surface, but storage shifts to a conversation-centric schema (see DB changes). `executionLogs` rows continue to be written for each tool call, now populated by the orchestrator rather than WS events.
- `config/` — env schema extended with executor settings (`OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`). Read/write of Hermes YAML kept; OpenClaw JSON write path is dropped (no process to configure).
- `events/` — unchanged API; internal event source rewires to orchestrator events.

### `apps/api/src/modules/orchestrator/` — new module

- `service.ts` — `submitTask`, `getTask`, `listTasks`, `cancelTask`. Task loop: resolve relevant brain skills → seed system prompt → call `executor.runChat()` → handle tool calls → persist messages → on completion, optionally write back a memory entry.
- `routes.ts` — REST endpoints `POST /api/orchestrator/tasks`, `GET /api/orchestrator/tasks`, `GET /api/orchestrator/tasks/:id`, `POST /api/orchestrator/tasks/:id/cancel`.
- `queue.ts` — simple in-process queue (Bun async), sufficient for single-node runtime; swappable later.

### DB schema changes

- New `agent_tasks` table (id, prompt, status, conversation_id, created_at, finished_at, result).
- New `conversations` table (id, task_id, created_at).
- New `messages` table (id, conversation_id, role, content, tool_calls, tool_call_id, tokens_in, tokens_out, created_at).
- Extend `execution_logs` with `conversation_id` FK; `tool_name` / `params` / `result` / `duration` kept.
- `skill_conflicts`: rename columns `hermes_hash` → `brain_hash`, `openclaw_hash` → `executor_hash`; drizzle migration handles rename.
- `sync_events`: keep as is (brain/executor are valid source/target strings).

### Web frontend changes

- Routes stay: `/`, `/skills`, `/memory`, `/execution`, `/config`, `/sync`.
- Semantics upgraded: Dashboard cards → "Brain" and "Executor" status; Execution page → conversation-replay view (messages + tool calls) rather than flat tool-call table; Config page → add executor section (endpoint/model/api key masked).
- New route `/orchestrator` (task list + submit form + single-task replay).

### Env / config

- Add: `OPENAI_BASE_URL` (default `https://api.openai.com`), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini` or similar), `OPENAI_TIMEOUT_MS`.
- Keep: `HERMES_API_URL`, `HERMES_HOME`.
- Remove runtime use: `OPENCLAW_WS_URL`, `OPENCLAW_HOME` (kept in schema for transitional compatibility, marked deprecated in comment).

### Execution strategy (BKD subtasks)

**Phase 1 — abstraction (parallelizable, subtasks 1–3)**

1. `packages/shared` Provider interfaces + type exports; no code consumers yet.
2. `HermesProvider` implementing `BrainProvider` by wrapping existing `adapters/hermes/*`. Unit-testable against a fake `HERMES_HOME` fixture.
3. `OpenAICompatibleExecutor` implementing `ExecutorProvider` (new `adapters/openai/*` for HTTP/SSE/tool-calling). Contract test against a mock server.

**Phase 2 — backend rewire (sequential, subtasks 4–5)**

4. Rewire five existing modules (`health`, `memory`, `skills`, `execution`, `config`) to consume providers. Drop `adapters/openclaw/ws-client.ts` + `event-logger.ts` usage. DB migration for schema changes.
5. New `orchestrator` module + `agent_tasks`/`conversations`/`messages` tables + task loop + tool-call bridging to `execution_logs`.

**Phase 3 — frontend + demo (subtasks 6–7, parallelizable)**

6. Update existing six pages for new semantics (brain/executor status, conversation-replay Execution page, executor config section).
7. New `/orchestrator` route: task list + submit form + single-task conversation replay.

**Phase 4 — integration (subtask 8)**

8. End-to-end demo: submit a task that queries a brain skill, runs a tool, writes back a memory; full trace visible in the UI. Update `CLAUDE.md` and `docs/changelog.md`.

Orchestration via BKD coordinator; each subtask worktree-isolated; `pma-cr` self-review before reporting.

## Risks

1. **API surface changes in backend modules** — frontend queries may break. Mitigation: keep REST paths/shapes stable where possible; only add new shapes for new data. Document any breaking field renames.
2. **DB migrations on existing data** — dev DB may have rows. Mitigation: accept destructive migration in dev (project still pre-release); document the reset procedure.
3. **Executor tool schema stability** — OpenAI-compatible providers vary slightly on tool-calling JSON (OpenAI vs Azure vs vLLM). Mitigation: use the OpenAI format as canonical, provide a simple adapter hook for non-standard servers, document tested endpoints.
4. **Secret handling** — `OPENAI_API_KEY` must never be logged or returned to the web client. Mitigation: mask in `config` module responses, never log in request logs.
5. **Orchestrator scope creep** — task queue, retries, cancellation, streaming, rate limits are all tempting to build at once. Mitigation: MVP loop only (queue → loop → persist → done); retries + rate limits are out of scope for this plan.
6. **OpenClaw naming confusion** — code still contains `adapters/openclaw/`, env `OPENCLAW_*`, DB column `openclaw_hash`. We keep the *conceptual* name "OpenClaw = executor layer" but the code artifacts should be renamed to avoid confusion between "the old WS adapter" and "the new executor concept". Mitigation: the WS adapter directory is removed (except skill-scanner util if reused); config/env normalizes to `EXECUTOR_*`; DB column renamed to `executor_hash`. The *product-level* branding "OpenClaw" survives only in user-facing docs and UI labels.

## Scope

- ~8 BKD subtasks across 4 phases
- ~1500 LOC backend (new providers + orchestrator + module rewires), ~500 LOC backend deletions, ~800 LOC frontend (new orchestrator page + semantic upgrades), ~300 LOC shared (provider interfaces).
- One DB migration; no breaking REST path changes if possible (field renames only).
- Deliverable: `bun dev` runs, Dashboard shows brain + executor health, user can submit a task at `/orchestrator` and watch the conversation-replay + memory write-back in real time.

## Alternatives

1. **Full rewrite** — start fresh in `apps/api/src/v2/`. Rejected per user direction ("keep skeleton + abstract refactor"). Wastes the completed PLAN-001 effort.
2. **Keep OpenClaw WS adapter and wrap it** — attempt to preserve the passive listener. Rejected: the banned OpenClaw process will not be running, so there is nothing to listen to. Dead weight.
3. **Executor as a sidecar process** — run a separate Node/Bun executor process, speak to it via WS (mimicking OpenClaw). Rejected: unnecessary complexity for a single-node runtime; adds ops burden without benefit.
4. **Skip orchestrator, build a thin chat endpoint** — just expose `POST /chat`. Rejected: loses the iteration / memory-write-back loop, which is the core new value per user direction ("knowledge base as brain + iteration").

## Annotations

(User annotations and responses. Keep all history.)
