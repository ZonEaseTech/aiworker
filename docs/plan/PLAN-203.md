# PLAN-203 Greenfield local worker rebuild

- **status**: pending_review
- **owner**: local
- **createdAt**: 2026-05-09 22:47
- **relatedTask**: REFACTOR-037

## Context

The previous hard reset was insufficient because it preserved the old worker
runtime, database, and API graph, then placed a smaller product surface on top.
That still produces an admin/runtime feel:

- `apps/api/src/modes/worker.ts` mounts Brain, evolution, channel, management,
  orchestrator, event, run, artifact, and review routers in one worker app.
- `registerWorkerOpenApiPaths()` still documents old management paths such as
  `/api/worker/sessions`, `/api/worker/schedule`,
  `/api/worker/approvals`, `/api/worker/brain/*`, and
  `/api/worker/orchestrator/conversations/*`.
- `apps/web/src/worker/lib/hooks.ts` still carries imports and query keys for
  Brain admission, cron, secrets, approvals, test, conversations, tasks, and
  Brain artifacts.
- `packages/storage-sqlite/src/worker/schema.ts` is still an accumulated worker
  runtime schema rather than a product workspace schema.
- `packages/core/src/worker/*` still contains channels, cron, approvals,
  evolution, conversation routing, decision pipeline, Brain management, and
  gateway-client concepts in the same worker domain.

The Open Design reference points in the opposite direction: local daemon first,
project/workspace files as the product center, conversations/messages tied to a
project, generated files and preview/review state as first-class artifacts, and
simple local persistence under a project-owned folder.

## Proposal

Implement this as a destructive multi-commit rebuild. The implementation should
prefer deletion over compatibility and should not try to migrate old local
worker state.

### S1 - Define the new local workspace kernel

- Replace the default worker schema with greenfield local tables:
  `workspaces`, `briefs`, `runs`, `run_events`, `files`, `artifacts`,
  `reviews`, `lessons`, and `settings`.
- Remove default worker tables for sessions, conversations, cron, approvals,
  evolution, brain journal, brain artifacts, and brain admission from the local
  worker path.
- Keep security primitives only where directly needed: local bearer token,
  secret refs for executor credentials, and audit/event provenance for runs.

Verification:

- storage schema tests for the new tables and indexes
- typecheck for storage/shared/core dependents

### S2 - Replace worker runtime with a small run engine

- Introduce a new local worker engine that only knows:
  brief intake, executor dispatch, run event streaming, assistant-output file
  capture, artifact indexing, review creation, and lesson proposal creation.
- Delete default coupling to channel registry, cron service, approval store,
  evolution observer/proposer, conversation router, and Brain management.
- Keep executor adapters as thin BYO runtime adapters; do not turn AIWorker
  into an executor platform.

Verification:

- focused core tests for run lifecycle, artifact capture, review, and lesson
  proposal
- no imports from deleted old subsystems in the new local worker engine

### S3 - Replace worker API with a local workspace API

- Replace `/api/worker/*` breadth with a small API:
  `/api/local/info`, `/api/local/workspace`, `/api/local/briefs`,
  `/api/local/runs`, `/api/local/files`, `/api/local/artifacts`,
  `/api/local/reviews`, `/api/local/lessons`, `/api/local/settings`,
  and `/api/local/events`.
- Remove old Brain/Admin/Channel/Cron/Approval/Orchestrator route modules from
  the default worker app.
- Regenerate OpenAPI docs from the new route surface only.

Verification:

- route tests for every retained local API group
- OpenAPI test asserting old route names are absent

### S4 - Rebuild worker Web as a workspace app

- Replace Worker Admin shell with a workspace product shell:
  left project/file rail, central run/preview surface, right review/lesson rail.
- First screen should be a usable workspace, not a dashboard.
- Use domain nouns: Workspace, Brief, Run, Files, Artifact, Review, Lesson.
- Delete old hook/client code for Brain admission, cron, secrets, approvals,
  tests, conversations, and tasks.

Verification:

- worker web route/render tests
- responsive layout tests
- `bun run --filter '@zonease/aiworker-web' build`

### S5 - Rebuild CLI as daemon launcher plus workspace automation

- Keep CLI minimal:
  `init`, `daemon`, `brief`, `run`, `files`, `artifacts`, `review`, `lessons`,
  `open`, `doctor`, and `executor`.
- Remove retained old command modules that are no longer reachable or relevant:
  worker schedule/sessions/scope/soul/token/up/env/config/approvals and fleet/
  gateway command trees from the local worker deliverable.
- Make `init` create a new-project local workspace, not a Project Brain/admin
  layout.

Verification:

- CLI registration/help tests
- daemon lifecycle tests
- source-local smoke over init -> daemon -> brief/run -> artifact -> review ->
  lesson

### S6 - Documentation, gates, and product evidence

- Rewrite README, GOALS, architecture, and CLI docs around the new local
  workspace product.
- Run source gates and CRG review.
- Start the app and capture a manual review pass before calling the task done.

Verification:

- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- source-local smoke
- CRG update/review

## Risks

- **Very large deletion surface**: existing tests encode old product decisions.
  They should be removed or rewritten, not massaged to preserve old semantics.
- **Gateway/Fleet coupling**: gateway bridge code may import old worker routes
  or protocols. This task should sever the default local worker from those
  paths and leave Fleet/Gateway for a later rebuild.
- **Release reset**: this is not a patch release unless the published package
  harness is rebuilt around the new local workspace shape.
- **Name collision with Project Brain**: durable lessons may still use Brain
  governance internally, but it must not appear as the primary product model.

## Out of Scope

- Desktop app.
- Remote fleet management.
- Old local database migration.
- Executor-native skill/plugin/MCP lifecycle redesign beyond the minimal
  adapter settings needed for runs.

## Approval Gate

Do not implement until the user explicitly approves this plan. Recommended
approval phrase: `proceed PLAN-203`.
