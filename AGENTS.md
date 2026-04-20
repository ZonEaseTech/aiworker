# AIWorker

Middleware glue service bridging Hermes Agent (knowledge/memory) with OpenClaw (execution/gateway).

## Project Development

Use `/pma` for workflow control, task tracking, and approval gates.
Use `/pma-bun` for backend implementation (Bun + Hono + Drizzle + SQLite).
Use `/pma-web` for frontend implementation (React 19 + Vite 8 + TanStack).
Use `/pma-cr` for code review before merge.
Use `/bkd` for multi-subtask orchestration via BKD kanban.
