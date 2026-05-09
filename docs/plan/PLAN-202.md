# PLAN-202 Hard reset OD-style worker product surface

- **status**: implementing
- **owner**: local
- **createdAt**: 2026-05-09 20:31
- **approvedAt**: 2026-05-09 20:31
- **relatedTask**: REFACTOR-036

## Context

The first OD-style reboot pass established useful building blocks but did not
complete the product reset. Current code still carries old governance-first
surfaces as visible operator paths:

- `apps/cli/src/aiworker.ts` registers `brain`, `case`, `fleet`, `gateway`,
  `sessions`, `schedule`, `approvals`, and mirrored `worker ...` commands.
- `apps/web/src/worker/routes/__root.tsx` still lists Brain, Cron, Approvals,
  Test, Secrets, and Config as the worker shell navigation.
- `apps/api/src/worker/cases/routes.ts` exposes old Case terminology even after
  `/reviews` was added.
- `docs/cli.md` still contains target commands such as `runs events`,
  `artifacts open`, `packs install`, and `lessons list` that are not implemented.

The user explicitly approved a destructive rewrite and rejected compatibility
thinking. Pre-1.0 compatibility aliases, old command names, and old default
navigation are not requirements.

## Proposal

Execute as long-running slices with conventional commits after each green slice.

### S1 - CLI product-surface hard reset

- Rewrite root CLI registration around only the OD-style local worker loop.
- Remove `case`, `brain`, `fleet`, `gateway`, `sessions`, `schedule`,
  `approvals`, and duplicated `worker ...` aliases from `aiworker.ts`.
- Keep internal command modules only if still needed by retained paths.
- Update CLI registration/preprocess/help tests.

Verification:

- `bun run --filter '@zonease/aiworker-cli' test -- src/aiworker.test.ts src/commands/worker/workbench.test.ts src/commands/worker/run.test.ts src/commands/worker/daemon.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`

### S2 - Worker Web workbench-only shell

- Replace worker shell navigation with Workbench, Runs, Artifacts, Reviews,
  Lessons, Settings.
- Remove Brain/Cron/Approvals/Test/Secrets routes from the route tree.
- Split Workbench panels into focused product pages where needed.
- Update Web tests and build.

Verification:

- focused worker web tests
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`

### S3 - Daemon/API case and brain surface cleanup

- Remove `/api/worker/cases` product route.
- Keep `/api/worker/reviews` and add `/api/worker/lessons` if needed.
- Hide Brain admission internals behind lesson promotion APIs.
- Update OpenAPI tests and route registrations.

Verification:

- focused API route tests
- `bun run --filter '@zonease/aiworker-api' typecheck`

### S4 - Runtime naming and data cleanup

- Introduce `ReviewService` and `LessonService` facades over reusable internals.
- Retire product-facing BrainCase/BrainInbox names from exported APIs.
- Remove legacy executor/config migration paths that only preserve old
  unpublished shapes.

Verification:

- focused core tests
- CRG impact review for runtime/shared changes

### S5 - Docs, smoke, and release readiness

- Rewrite `docs/cli.md`, README, GOALS, and architecture to current implemented
  behavior only.
- Add source-local smoke for init -> daemon -> run -> artifacts -> review ->
  lesson promotion.
- Run source gates and prepare a separate release task if the source tree is
  shippable.

Verification:

- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- source-local smoke
- CRG review

## Risks

- **Large surface breakage**: removing command aliases and routes will break old
  tests and docs. This is intentional; tests must be rewritten to the new
  product contract.
- **Hidden coupling**: gateway/fleet and worker bridge tests may import old
  worker routes. These should be severed rather than preserved as product APIs.
- **Runtime naming churn**: changing exported core names can cascade through
  scripts and harnesses. Handle this after CLI/Web/API surfaces are clean.
- **Release delay**: this should not be published until source smoke and
  published-package harness are green.

## Progress

- 2026-05-09 20:31: Created hard-reset task and plan after explicit user
  instruction to stop preserving legacy compatibility thinking.
- 2026-05-09 20:46: Completed S1 CLI product-surface hard reset. Root CLI now
  exposes only the local worker loop (`init`, `daemon`, `run`, `runs`,
  `artifacts`, `pack`, `review`, `lessons`, `doctor`, `executor`), rejects old
  Brain/Case/Fleet/Gateway/worker aliases, and updates init onboarding to
  daemon/run/review/lesson flow only. Full CLI package tests and typecheck pass.
- 2026-05-09 20:59: Completed S2 Worker Web shell hard reset. Worker route tree
  now contains only Workbench, Runs, Artifacts, Reviews, Lessons, and Settings;
  old Chat/Cases/Brain/Cron/Approvals/Test/Secrets pages were removed from the
  worker bundle. Worker web tests, typecheck, worker build, and full web build
  pass. Full web test command was interrupted after hanging without output; the
  worker-specific test suite is green.
- 2026-05-09 21:05: Completed S3 local worker API cleanup. `/api/worker/cases`
  is no longer mounted or documented, the web client/hooks no longer expose
  case endpoints, daemon gateway handlers no longer implement case actions, and
  CLI review tests no longer carry public case wrappers. Focused API/web/CLI
  tests, API/Web/CLI typecheck, `git diff --check`, and CRG review pass. Gateway
  protocol and core service naming remain for S4 removal/renaming.
