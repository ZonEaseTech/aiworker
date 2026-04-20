# AIWorker

Self-hosted Agent Runtime composing a Brain provider (knowledge/memory) and an Executor provider (OpenAI-compatible chat completions + tool calling).

## Project Development

Use `/pma` for workflow control, task tracking, and approval gates.
Use `/pma-bun` for backend implementation (Bun + Hono + Drizzle + SQLite).
Use `/pma-web` for frontend implementation (React 19 + Vite 8 + TanStack).
Use `/pma-cr` for code review before merge.
Use `/bkd` for multi-subtask orchestration via BKD kanban.

## Stack

- **Backend**: Bun, Hono (OpenAPIHono), Drizzle ORM, SQLite
- **Frontend**: React 19, TypeScript, Vite 8, TanStack Router + Query, Zustand, shadcn/ui, Tailwind CSS v4
- **Integration**: OpenAI-compatible executor endpoint (chat completions + tool calling), agentskills.io standard, REST + SSE APIs
