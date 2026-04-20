# PLAN-001 AIWorker product build — monorepo scaffold and core modules

- **status**: implementing
- **createdAt**: 2026-04-20 09:45
- **approvedAt**: 2026-04-20 10:00
- **relatedTask**: FEAT-001

## Context

### What exists

- Empty aiworker project directory with PMA docs structure
- BKD project `lded7ogt` (alias: `aiworker`) registered and running
- Available skills: pma, pma-bun, pma-web, pma-cr, bkd
- BKD capacity: 44 available slots

### Target systems (external, not modified)

- **Hermes Agent**: Python, `~/.hermes/` (skills, memories, config.yaml, .env), API server on `:8642`, MCP server via `hermes mcp serve`
- **OpenClaw**: TypeScript, `~/.openclaw/` (workspace, openclaw.json, .env), Gateway WS on `:18789`, plugin system

### Research findings

- Both systems use agentskills.io standard for skills — bidirectional sync is feasible via shared directory or file copy
- Hermes exposes MCP server with 10 messaging tools (conversations, messages, events) but no direct memory/skill query tools
- Hermes memories and skills are plain files on disk — direct filesystem access is the most reliable and low-latency approach
- OpenClaw Gateway speaks WebSocket with JSON frames; plugin hooks (before_tool_call, after_tool_call) exist but maturity is mixed
- Hermes API Server speaks OpenAI-compatible REST at `:8642` with full tool access

## Proposal

Build a Bun monorepo with two apps (API backend + web frontend) and shared packages.

### Monorepo structure

```
aiworker/
├── apps/
│   ├── api/                    # Bun + OpenAPIHono backend
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── health/     # Health checks for Hermes + OpenClaw + self
│   │       │   ├── skills/     # Skill discovery, diff, sync
│   │       │   ├── memory/     # Memory file read, search, feedback write
│   │       │   ├── execution/  # OpenClaw execution event capture
│   │       │   ├── config/     # Unified config read/write
│   │       │   └── events/     # SSE stream to frontend
│   │       ├── adapters/
│   │       │   ├── hermes/     # Filesystem + API + MCP client
│   │       │   └── openclaw/   # Gateway WS + config file
│   │       ├── db/             # Drizzle schema + migrations
│   │       ├── app.ts
│   │       └── index.ts
│   └── web/                    # React 19 + Vite 8 frontend
│       └── src/
│           ├── routes/
│           │   ├── __root.tsx
│           │   ├── index.tsx           # Dashboard
│           │   ├── skills/
│           │   ├── memory/
│           │   ├── execution/
│           │   ├── config/
│           │   └── sync/
│           ├── components/
│           ├── lib/
│           └── main.tsx
├── packages/
│   └── shared/                 # Shared types, constants, validators
├── docs/
├── .agents/
├── package.json
├── bunfig.toml
└── CLAUDE.md
```

### Phase breakdown (BKD subtasks)

#### Phase 1: Monorepo scaffold + backend core (subtasks 1-3)

1. **Scaffold monorepo** — Bun workspace, eslint, tsconfig, shared package, CI scripts
2. **Backend API skeleton** — OpenAPIHono app, health module, Drizzle + SQLite setup, dev/prod bootstrap
3. **Hermes adapter** — filesystem watcher for `~/.hermes/skills/` and `~/.hermes/memories/`, API client for `:8642`

#### Phase 2: Core integration modules (subtasks 4-6)

4. **Skills sync module** — scan both skill dirs, compute diff (added/modified/deleted), sync via file copy, conflict tracking in SQLite
5. **Memory bridge module** — parse MEMORY.md index, read individual memory files, full-text search, write execution feedback as memory entries
6. **OpenClaw adapter** — WebSocket client for Gateway `:18789`, event capture (tool calls, results, lifecycle), store in SQLite event log

#### Phase 3: Frontend (subtasks 7-9)

7. **Web scaffold** — Vite 8, TanStack Router, shadcn/ui, Tailwind v4, API proxy to backend
8. **Dashboard + Skills pages** — service status cards, skill list with diff view, one-click sync
9. **Memory + Execution + Config pages** — memory browser with search, live execution feed, config editor

#### Phase 4: Integration and polish (subtask 10)

10. **End-to-end integration** — SSE event stream, sync status page, health dashboard, compile + deploy scripts

### Execution strategy

- Use BKD orchestration: coordinator issue dispatches subtasks
- Phases 1-2: sequential within phase (dependencies), parallel across subtasks where possible
- Phase 3: web subtasks can run in parallel after backend API is stable
- Worktree mode for all subtasks (multiple modules being built simultaneously)
- Each subtask runs pma-cr self-review before reporting

## Risks

1. **Hermes/OpenClaw not installed locally**: Adapters must handle missing services gracefully (health check returns degraded, not crash)
2. **File watcher race conditions**: Two processes modifying skill files simultaneously — mitigate with optimistic sync + conflict detection
3. **OpenClaw WS protocol undocumented details**: Gateway handshake requires connect frame with device identity — may need reverse-engineering
4. **Scope creep**: 10 subtasks is already large — strictly enforce MVP per subtask

## Scope

- 10 BKD subtasks across 4 phases
- Estimated: ~2000-3000 LOC backend, ~2000-3000 LOC frontend, ~500 LOC shared
- Deliverable: running monorepo with `bun dev` serving both API and web, connecting to local Hermes/OpenClaw instances

## Alternatives

1. **Single-app instead of monorepo**: Simpler but harder to scale and doesn't match pma-bun conventions
2. **Skip frontend, API-only**: Faster but loses the management UI value proposition — rejected per user requirement
3. **Use Hermes API for everything instead of filesystem**: Higher latency, costs LLM tokens per query — filesystem is better for skills/memory read

## Annotations

(User annotations and responses. Keep all history.)
