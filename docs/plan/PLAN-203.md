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

## Open Design Reference Mapping

The rebuild should copy Open Design's product intention, not its image/video
domain. Current reference anchors:

- `apps/daemon/src/server.ts`: one local daemon owns projects, files,
  conversations, comments, tabs, deployments, and run streams under a compact
  HTTP API.
- `apps/daemon/src/projects.ts`: the project directory is the source of truth
  for real user files, with strict path validation and archive/search/read/write
  helpers.
- `apps/daemon/src/db.ts`: SQLite tracks project metadata, conversations,
  messages, comments, tabs, deployments, and run status while files remain on
  disk.

Mapping for AIWorker:

| Open Design intention | AIWorker greenfield equivalent | Explicit non-copy |
| --- | --- | --- |
| local daemon as the product backend | local worker daemon with `/api/local/*` only | no Fleet/Gateway control plane in the local deliverable |
| project folder as the work surface | workspace folder with files, artifacts, and run outputs | no old Project Brain admin layout |
| conversations/messages organize creative runs | briefs/runs organize HR/developer/PM work loops | no generic chat/session management surface |
| generated files are first-class visible artifacts | run output files and artifacts drive Web center panel | no hidden execution-log-only result model |
| preview comments and tabs keep review context attached to files | reviews and lessons attach to artifacts/runs with provenance | no Brain admission UI as the primary review model |
| SQLite stores compact local metadata | worker.db stores workspace/run/review/lesson metadata only | no accumulated cron/channel/approval/evolution schema |
| skills/design systems/prompt templates shape generation intent | domain templates and executor hints shape worker intent | no image/video-specific concepts in product nouns |

This means the greenfield product surface should feel like a local workspace
tool that happens to execute work through BYO agents. It should not feel like a
runtime admin console that happens to show run history.

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

## Implementation Status Board

This board is the single execution ledger for the approved rebuild. Before the
approval gate is cleared, every batch remains `blocked_pending_approval`.

| Batch | Status | Primary entry files | Blocking condition | Evidence slot |
| --- | --- | --- | --- | --- |
| B1 storage/shared contracts | blocked_pending_approval | `packages/storage-sqlite/src/worker/*`, `packages/shared/src/*` | PLAN-203 approval not received | pending |
| B2 core local run engine | blocked_pending_approval | `packages/core/src/worker/*` | B1 contracts not merged and PLAN-203 approval not received | pending |
| B3 local daemon/API | blocked_pending_approval | `apps/api/src/modes/worker.ts`, `apps/api/src/worker/*` | B1/B2 contracts not available and PLAN-203 approval not received | pending |
| B4 CLI reset | blocked_pending_approval | `apps/cli/src/aiworker.ts`, `apps/cli/src/commands/*` | local API contract not stable and PLAN-203 approval not received | pending |
| B5 Worker Web rebuild | blocked_pending_approval | `apps/web/src/worker/*` | local API contract not stable and PLAN-203 approval not received | pending |
| B6 docs/smoke/review | blocked_pending_approval | `README.md`, `GOALS.md`, `docs/architecture.md`, `tmp/*` | B1-B5 implementation evidence missing and PLAN-203 approval not received | pending |

Status values:

- `blocked_pending_approval`: PMA proposal is ready but implementation is not
  authorized.
- `in_progress`: implementation is actively being edited for that batch.
- `verification`: code is written and batch-specific gates are running.
- `done`: batch commit exists and its evidence slot contains current command
  output or artifact references.
- `blocked`: implementation found a concrete technical blocker that requires
  re-planning.

## Removal and Replacement Inventory

This inventory is the implementation guardrail: items in the "remove/isolate"
column must not remain reachable from the default local worker deliverable. If a
file must be kept temporarily for later Fleet/Gateway work, it must be
disconnected from local daemon, CLI, Web, OpenAPI, and smoke paths.

| Area | Current old surface | Remove/isolate | Replace with | Batch |
| --- | --- | --- | --- | --- |
| API bootstrap | `apps/api/src/modes/worker.ts` mounts `/api/worker/*`, root channel webhooks, and manual OpenAPI registrations | Remove default `/api/worker/*` product surface and old OpenAPI registrations | local daemon app mounting `/api/local/*` only | B3 |
| API routers | `apps/api/src/worker/brain`, `channels`, `evolution`, `management`, `orchestrator` | Delete from default local daemon or quarantine for later non-local work | local `info`, `workspace`, `briefs`, `runs`, `files`, `artifacts`, `reviews`, `lessons`, `settings`, `events` routers | B3 |
| API tests | route tests and OpenAPI tests assert old `/api/worker/brain`, `/orchestrator`, `/sessions`, `/approvals`, `/cron` behavior | Rewrite as absence tests for old routes and positive tests for `/api/local/*` | route coverage for every retained local group | B3 |
| Storage | `packages/storage-sqlite/src/worker/schema.ts` defines `agent_tasks`, `conversations`, `session_entries`, `messages`, `execution_logs`, `brain_journal_events`, `cron_jobs`, `brain_artifacts`, `brain_admission_*` | Remove from default local worker schema and application reads | `workspaces`, `briefs`, `runs`, `run_events`, `files`, `artifacts`, `reviews`, `lessons`, `settings` | B1 |
| Core runtime | `packages/core/src/worker/{channels,conversation,cron,evolution,management,orchestrator,gateway-client}` | Disconnect from local worker engine; delete or quarantine old product runtime | minimal local run engine around brief -> run -> artifact -> review -> lesson | B2 |
| Core Brain surface | `packages/core/src/worker/brain/*` drives admission, artifacts, journal, reviewer, summary as visible product model | Remove as default local product surface; lessons may use a future internal durable-context adapter only if hidden from UI/API/CLI | lesson proposal records with provenance, not Brain admin workflows | B2 |
| CLI registration | `apps/cli/src/aiworker.ts` still registers old run/review terms plus `pack`, compatibility command index, executor overlay commands, and daemon wording tied to worker admin | Re-register from a greenfield command map; no hidden aliases for removed commands | `init`, `daemon`, `brief`, `run`, `files`, `artifacts`, `review`, `lessons`, `open`, `doctor`, `executor` | B4 |
| CLI command trees | `apps/cli/src/commands/fleet`, `commands/gateway`, and old `commands/worker/*` modules for schedule/session/scope/soul/token/up/env/config/approvals | Remove from local deliverable or quarantine outside `aiworker` command registration | local workspace command modules and source-local smoke harness | B4 |
| Web data layer | `apps/web/src/worker/api.ts`, `lib/hooks.ts`, tests, and bootstrap mocks still call `/api/worker/*`, conversations, approvals, cron, Brain, channels, and fleet-hosted bridge paths | Delete old client/hook/query-key model | typed local workspace client for `/api/local/*` | B5 |
| Web UI | `apps/web/src/worker/features/config/*`, old routes, and workbench panels still reflect admin/config/work order history | Replace first paint and navigation with workspace product shell | file rail, run/preview surface, review/lesson rail, settings as secondary | B5 |
| Shared contracts | shared Brain/Fleet/Soul schemas leak old product nouns into worker info and API types | Keep only contracts required by the new local workspace path; quarantine Fleet/Gateway contracts outside local worker imports | local workspace DTOs and executor adapter DTOs | B1 |
| Docs/smoke | README, GOALS, architecture, CLI docs, and smoke names still describe Project Brain + Worker/Fleet aggregation as the shipped worker product | Rewrite local worker docs around the greenfield workspace loop; leave Fleet/Gateway as parked future scope | source-local proof from fresh state and manual browser review | B6 |

## Greenfield Contract Draft

This is the minimal product contract for implementation. It is intentionally
new and does not map old session/conversation/task/Brain-admin records into the
new model.

Domain entities:

| Entity | Purpose | Required fields |
| --- | --- | --- |
| `workspace` | Local project scope and file root | `id`, `name`, `rootPath`, `createdAt`, `updatedAt` |
| `brief` | User intent to run work in a workspace | `id`, `workspaceId`, `title`, `body`, `status`, `createdAt`, `updatedAt` |
| `run` | One executor attempt for a brief or direct prompt | `id`, `workspaceId`, `briefId`, `status`, `executor`, `summary`, `startedAt`, `finishedAt` |
| `run_event` | Ordered stream event for one run | `id`, `runId`, `seq`, `type`, `payloadJson`, `createdAt` |
| `file` | Indexed file under the workspace root | `id`, `workspaceId`, `path`, `kind`, `size`, `mtime`, `source`, `updatedAt` |
| `artifact` | User-visible output promoted from files/run events | `id`, `workspaceId`, `runId`, `path`, `kind`, `title`, `status`, `metadataJson`, `updatedAt` |
| `review` | Evaluation attached to a run/artifact | `id`, `workspaceId`, `runId`, `artifactId`, `verdict`, `findingsJson`, `createdAt` |
| `lesson` | Proposed durable learning from a review | `id`, `workspaceId`, `sourceReviewId`, `statement`, `evidenceJson`, `status`, `createdAt` |
| `setting` | Local daemon/workspace setting | `key`, `valueJson`, `updatedAt` |

API contract:

| Group | Routes |
| --- | --- |
| info | `GET /api/local/info` |
| workspace | `GET /api/local/workspace`, `PATCH /api/local/workspace` |
| briefs | `GET /api/local/briefs`, `POST /api/local/briefs`, `GET /api/local/briefs/:id`, `PATCH /api/local/briefs/:id` |
| runs | `GET /api/local/runs`, `POST /api/local/runs`, `GET /api/local/runs/:id`, `POST /api/local/runs/:id/cancel`, `GET /api/local/runs/:id/events` |
| files | `GET /api/local/files`, `GET /api/local/files/raw/*`, `PUT /api/local/files/raw/*`, `DELETE /api/local/files/raw/*`, `GET /api/local/files/search` |
| artifacts | `GET /api/local/artifacts`, `GET /api/local/artifacts/:id` |
| reviews | `GET /api/local/reviews`, `POST /api/local/reviews`, `GET /api/local/reviews/:id` |
| lessons | `GET /api/local/lessons`, `POST /api/local/lessons`, `PATCH /api/local/lessons/:id` |
| settings | `GET /api/local/settings`, `PATCH /api/local/settings` |
| events | `GET /api/local/events` |

CLI contract:

| Command | Purpose |
| --- | --- |
| `aiworker init` | create the local workspace and metadata store |
| `aiworker daemon start/status/stop/logs/foreground` | run and inspect the local daemon |
| `aiworker brief create/list/show` | manage workspace briefs |
| `aiworker run start/list/show/cancel` | operate executor runs |
| `aiworker files list/show/write/delete/search` | inspect and edit workspace files |
| `aiworker artifacts list/show/open` | inspect user-visible run outputs |
| `aiworker review list/show/create` | inspect or create reviews |
| `aiworker lessons list/propose/accept/reject` | manage lesson proposals |
| `aiworker open` | open Worker Web for the local daemon |
| `aiworker doctor` | verify local daemon, workspace, storage, and executor readiness |
| `aiworker executor select/doctor` | configure and verify the thin BYO executor adapter |

Web information architecture:

- Left rail: workspace identity, briefs, file tree, artifact list.
- Center surface: active brief, run stream, file/artifact preview.
- Right rail: review findings, lesson proposals, run metadata.
- Settings view: daemon health, executor adapter settings, local bearer state,
  and workspace metadata only.

## Prompt-to-Artifact Checklist

| Requirement from user objective | Required artifact/evidence before completion |
| --- | --- |
| "像全新项目一样" / "毫无保留" | removal inventory above is satisfied; old local worker routes, commands, schema reads, Web hooks, and visible nouns are absent |
| "以 Open Design 为参照，1:1 去还原设计语言和项目意图" | Web first paint and docs show a local workspace loop centered on files/artifacts/runs/reviews/lessons rather than admin status cards |
| "只从适用领域区分，OD 做图片/视频设计，我们做 HR/developer/pm 等" | domain stays general-purpose workspace/brief/run/artifact/review/lesson without coding-only PMA or design-only nouns |
| "fleet 和 gateway 可以先晾在一旁" | Fleet/Gateway are not reachable from local worker CLI/Web/API smoke paths; any retained code is quarantined and not part of the deliverable |
| "desktop 可以先不做" | no desktop/Electron deliverable is introduced |
| "daemon(也就是 cli)/web 是需要的" | CLI daemon workflow, local HTTP API, and Worker Web are implemented and manually reviewed |
| "从零开始的重构，不要被原始设计干扰" | old tests are rewritten/deleted when they encode removed semantics; no migration, aliases, or hidden compatibility endpoints |
| "配合 PMA 规范，拆分长任务" | REFACTOR-037 and PLAN-203 stay current; B1-B6 commits are recorded with evidence |
| "goal 模式最终实现" | active goal is only marked complete after this checklist and completion audit have real evidence |

## Completion Audit Command Matrix

These commands must be run after implementation, from the repository root, and
their outputs must be recorded in the final implementation notes. A passing
package test suite is not enough unless these checks also show that removed
surfaces are absent from the local deliverable.

Positive surface checks:

```sh
rg -n "/api/local/(info|workspace|briefs|runs|files|artifacts|reviews|lessons|settings|events)" apps/api/src apps/web/src apps/cli/src packages
rg -n "workspaces|briefs|run_events|artifacts|reviews|lessons|settings" packages/storage-sqlite/src/worker packages/shared/src packages/core/src/worker
rg -n "brief|artifact|lesson|workspace" apps/cli/src apps/web/src/worker
```

Negative route/API checks:

```sh
! rg -n "/api/worker/(brain|orchestrator|sessions|schedule|approvals|cron|channels|evolution)" apps/api/src apps/web/src/worker apps/cli/src
! rg -n "registerWorkerOpenApiPaths|buildBrainRoutes|buildOrchestratorRoutes|buildChannelRoutes|evolutionRoutes|buildManagementRoutes" apps/api/src/modes apps/api/src/worker
```

Negative persistence checks:

```sh
! rg -n "agent_tasks|conversations|session_entries|messages|execution_logs|brain_journal_events|cron_jobs|brain_artifacts|brain_admission" packages/storage-sqlite/src/worker packages/core/src/worker packages/shared/src apps/api/src apps/cli/src apps/web/src/worker
```

Negative runtime import checks:

```sh
! rg -n "worker/(channels|conversation|cron|evolution|management|orchestrator|gateway-client|brain)" packages/core/src/worker apps/api/src apps/cli/src apps/web/src/worker
! rg -n "ChannelRegistry|CronService|ApprovalStore|Evolution|ConversationRouter|BrainAdmission|GatewayClient" packages/core/src/worker apps/api/src apps/cli/src apps/web/src/worker
```

Negative CLI/Web checks:

```sh
! rg -n "commands/(fleet|gateway)|worker/(approvals|config|env|schedule|scope|sessions|soul|token|up)" apps/cli/src
! rg -n "brain admission|cron|approvals|conversation|fleet-hosted|channel test|worker admin" apps/web/src/worker
```

Required gate commands:

```sh
bun run --filter '@zonease/aiworker-storage-sqlite' test
bun run --filter '@zonease/aiworker-storage-sqlite' typecheck
bun run --filter '@zonease/aiworker-shared' typecheck
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-api' test
bun run --filter '@zonease/aiworker-api' build
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-cli' build:bundle
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-web' build
bun run check
bun run test
bun run build
git diff --check
bun run crg:update
bun run crg:review
```

Source-local smoke must use a fresh `AIWORKER_HOME` and fresh workspace path.
It must demonstrate: init -> daemon -> brief/run -> artifact -> review ->
lesson, then open Worker Web in a browser for manual inspection.

## Current Baseline Failure Snapshot

Captured before implementation on 2026-05-09 23:09. This snapshot is not a
completion signal; it documents the current failure state that B1-B6 must erase.

| Audit check | Current result | Representative evidence |
| --- | --- | --- |
| positive `/api/local/*` surface scan | 0 matching files | local workspace API is not implemented yet |
| negative old route/API scan | 8 matching files | `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.openapi.test.ts`, `apps/api/src/worker/brain/routes.ts`, `apps/web/src/worker/api.ts` |
| negative persistence scan | 78 matching files | `packages/storage-sqlite/src/worker/schema.ts`, `packages/core/src/worker/conversation/router.ts`, `packages/core/src/worker/brain/journal/service.ts`, `apps/web/src/worker/lib/hooks.ts` |
| negative runtime import scan | 53 matching files | `packages/core/src/worker/runtime.ts`, `packages/core/src/worker/orchestrator/service.ts`, `packages/core/src/worker/gateway-client/client.ts`, `apps/api/src/modes/worker.ts` |
| negative CLI command scan | matching files remain | `apps/cli/src/commands/worker/approvals.ts`, `apps/cli/src/commands/worker/config.ts`, `apps/cli/src/commands/worker/serve.ts`, `apps/cli/src/operator/daemon.ts` |
| negative Web legacy scan | matching files remain | `apps/web/src/worker/api.ts`, `apps/web/src/worker/lib/hooks.ts`, `apps/web/src/worker/__tests__/bootstrap.test.tsx`, `apps/web/src/worker/features/workbench/loop-panels.tsx` |

The final implementation notes must show the positive scan becoming non-empty
and every negative scan becoming empty for the default local worker deliverable.

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
