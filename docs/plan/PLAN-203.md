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

## Long-Task Execution Plan

After approval, implement in these checkpoints. Each checkpoint should be a
separate conventional commit unless a later gate forces a small corrective
commit.

### B1 - Storage and shared contracts

Write scope:

- `packages/storage-sqlite/src/worker/*`
- `packages/shared/src/*` local workspace contracts
- storage/shared tests that describe the new local model

Delete or rewrite:

- default local usage of session, conversation, message, cron, approval,
  evolution, brain journal, brain artifact, and brain admission tables
- shared schemas that only exist to expose the removed worker admin model

Evidence before commit:

- storage tests for new tables and indexes
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
- `bun run --filter '@zonease/aiworker-shared' typecheck`

Expected commit: `refactor: 重建 local worker 存储模型`

### B2 - Core local run engine

Write scope:

- `packages/core/src/worker/*`
- focused core tests for brief/run/artifact/review/lesson lifecycle

Delete or rewrite:

- default local imports of channel registry, cron service, approval store,
  evolution observer/proposer, conversation router, Brain management, and
  gateway-client paths
- orchestration branches that only preserve the removed admin/runtime model

Evidence before commit:

- run lifecycle tests
- import absence scan for removed subsystems in the new local engine
- `bun run --filter '@zonease/aiworker-core' test`

Expected commit: `refactor: 重写 local worker run engine`

### B3 - Local daemon and API surface

Write scope:

- `apps/api/src/*`
- API schemas, OpenAPI registration, route tests, daemon bootstrap tests

Delete or rewrite:

- default `/api/worker/*` route registration
- Brain/Admin/Channel/Cron/Approval/Orchestrator route modules from the default
  local daemon
- generated OpenAPI exposure of removed route families

Evidence before commit:

- route tests for each `/api/local/*` group
- OpenAPI absence test for old route families
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-api' build`

Expected commit: `refactor: 替换 local daemon api`

### B4 - CLI command reset

Write scope:

- `apps/cli/src/*`
- CLI command registration/help tests
- source-local smoke harness entrypoints

Delete or rewrite:

- local deliverable commands for worker schedule/session/scope/soul/token/up/
  env/config/approval and fleet/gateway command trees
- init paths that create an old Project Brain/admin layout

Evidence before commit:

- CLI help snapshot or equivalent registration test
- daemon lifecycle test
- source-local init -> daemon -> brief/run smoke starts successfully
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`

Expected commit: `refactor: 收敛 local workspace cli`

### B5 - Worker Web rebuild

Write scope:

- `apps/web/src/worker/*`
- shared UI primitives only when directly needed by the new shell
- Web route/render/responsive tests

Delete or rewrite:

- old worker admin pages
- hooks and clients for Brain admission, cron, secrets, approvals, tests,
  conversations, tasks, and old Brain artifacts

Evidence before commit:

- worker web render tests
- responsive layout checks
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`

Expected commit: `refactor: 重建 worker workspace web`

### B6 - Docs, smoke, and full review

Write scope:

- `README.md`
- `GOALS.md`
- `docs/architecture.md`
- CLI/API/Web task docs and changelog entries required by PMA
- smoke evidence under `tmp/`

Delete or rewrite:

- documentation that still presents the local worker as an admin dashboard,
  Brain admin, Fleet/Gateway surface, or compatibility runtime

Evidence before commit:

- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- source-local smoke over a fresh home
- CRG update/review
- manual browser review of the running Web app

Expected commit: `docs: 对齐 greenfield worker 产品文档`

## Completion Audit Checklist

The task is not complete until every item below has current evidence in the
final implementation notes:

- **Product reset**: Worker Web, CLI help, OpenAPI docs, and README present the
  product as a local workspace loop: workspace -> brief -> run ->
  files/artifacts -> review -> lessons.
- **No compatibility surface**: old worker nouns and route families are absent
  from shipped source paths, generated OpenAPI, CLI command registration, and
  visible Web navigation: sessions, conversations, schedule, approvals,
  channel, evolution, Brain admin, Fleet, and Gateway.
- **Persistence reset**: the default local worker database is created from the
  greenfield tables only. No application path depends on old local worker
  tables or migration-era compatibility reads.
- **Runtime reset**: the local worker engine has no imports from the deleted
  channel, cron, approval, evolution, conversation-router, Brain-management, or
  gateway-client subsystems.
- **API reset**: only the approved `/api/local/*` groups are mounted for the
  default local worker app, with route tests and an OpenAPI absence test for
  removed paths.
- **Web reset**: Worker Web is a workspace application on first paint, with
  file/project rail, run/preview surface, and review/lesson rail. Old admin
  dashboard hooks and clients are deleted rather than hidden.
- **CLI reset**: `aiworker --help` and command tests expose only the new local
  daemon/workspace automation commands for this deliverable.
- **Smoke proof**: a fresh source-local run demonstrates init -> daemon ->
  brief/run -> artifact -> review -> lesson without using pre-existing local
  worker state.
- **Review proof**: full gates, focused package gates, `git diff --check`, CRG
  review, and a manual browser review are recorded before marking the task
  complete.

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
