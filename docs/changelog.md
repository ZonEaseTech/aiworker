# AIWorker Changelog

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
