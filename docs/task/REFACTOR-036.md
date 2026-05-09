# REFACTOR-036 Hard reset OD-style worker product surface

- **status**: in_progress
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 20:31
- **claimedAt**: 2026-05-09 20:31
- **plan**: PLAN-202
- **relatesTo**: REFACTOR-026, PLAN-192, GOALS.md, docs/architecture.md, apps/cli, apps/api, apps/web, packages/core

## Background

REFACTOR-026 moved AIWorker toward an Open Design-style local worker loop, but the
implementation still retained too much old surface:

- CLI still exposes Brain, Case, Fleet, Gateway, Sessions, Cron, Approvals, and
  duplicated `worker ...` compatibility commands.
- Worker Web still behaves like an admin dashboard with Brain/Cron/Approvals/Test
  pages in the main navigation.
- API still exposes old `cases` and `brain` product paths alongside `reviews`.
- Core service names still surface Brain Case / Inbox / Admission as product concepts.
- Docs still mix implemented commands with target-state commands that do not exist.

The current direction is not another incremental cleanup. The worker product must
be hard reset around one loop:

```text
worker pack -> work order -> run -> artifact -> review -> lesson
```

## Goal

Perform a destructive rewrite of the local worker product surface. Remove old
compatibility thinking and make the Open Design-style loop the only default
operator experience.

## Scope

1. CLI hard reset
   - Keep: `init`, `daemon`, `run`, `runs`, `artifacts`, `pack`, `review`,
     `lessons`, `doctor`, `executor`.
   - Remove from the default CLI: `brain`, `case`, `fleet`, `gateway`,
     `sessions`, `schedule`, `approvals`, and duplicated `worker ...` aliases.
   - Remove `--global` and legacy init/startup language where it exists only to
     preserve old layouts.

2. Worker Web hard reset
   - Main navigation becomes Workbench, Runs, Artifacts, Reviews, Lessons,
     Settings.
   - Remove Brain/Cron/Approvals/Test/Secrets as first-class pages.
   - Keep required settings behind the new Settings surface only.

3. Daemon/API hard reset
   - Make product-facing local paths the source of truth.
   - Remove `/api/worker/cases` and old case wrappers.
   - Keep Brain/Admission internals only where they back lesson promotion; do
     not expose them as default product APIs.

4. Runtime naming cleanup
   - Rename or wrap old Brain Case / Inbox / Admission concepts behind Review,
     Lesson, and Context services.
   - Keep provenance, redaction, rollback, and audit invariants.

5. Docs and validation
   - Rewrite CLI/docs to describe only implemented current behavior.
   - Add a source-local smoke covering init -> daemon -> run -> artifacts ->
     review -> lesson promotion.
   - Release only after source gates and published-package harness pass.

## Non-goals

- No desktop/Electron work.
- No new Fleet/Gateway feature work.
- No compatibility aliases for pre-1.0 CLI/API/config surfaces.
- No hidden fallback path that keeps old case/brain routes as the recommended
  product surface.

## Acceptance Criteria

- Root CLI help contains no Brain/Case/Fleet/Gateway onboarding path.
- Worker Web main nav contains no Brain/Cron/Approvals/Test admin dashboard
  pages.
- `case` commands and `/cases` routes are removed or replaced by `review`.
- Docs no longer advertise unimplemented target commands.
- Focused CLI/Web/API tests, `bun run check`, `bun run build`, and CRG review
  pass for each code slice.
- Final release slice runs source-local worker smoke and published-package
  compact harness.

## Notes

This task intentionally supersedes the previous "secondary/admin surface"
interpretation from REFACTOR-035. Secondary is no longer enough where old
concepts keep shaping the default mental model.

## Progress

- 2026-05-09 20:46: S1 complete. CLI registration, root help, argv folding,
  daemon startup, init next steps, and CLI integration tests now enforce the
  hard-reset local worker loop. Removed public gateway lifecycle integration
  tests from the CLI package and converted old quick-start assertions into
  retired-command guards.
- 2026-05-09 20:59: S2 complete. Worker Web now routes only Workbench, Runs,
  Artifacts, Reviews, Lessons, and Settings. Removed old page components and
  routes for Chat, Cases, Brain, Cron, Approvals, Test, and Secrets. Verification:
  worker web tests, typecheck, worker build, full web build, and CRG review.
- 2026-05-09 21:05: S3 local worker API cleanup complete. Removed
  `/api/worker/cases`, deleted the case route module/tests, removed web case
  client/hooks, removed daemon dispatcher case handlers, and retired CLI case
  wrapper tests/functions. Verification: focused API/web/CLI tests,
  API/Web/CLI typecheck, `git diff --check`, and CRG review.
- 2026-05-09 21:19: S4 runtime naming cleanup complete. Renamed core
  Case/Inbox services to `WorkerReviewService` and `LessonPromotionService`,
  moved them out of `worker/brain/*`, switched gateway bridge protocol to
  `reviews.*`, removed orphan CLI brain command modules/tests, and refreshed
  Soul pack durable-governance wording around lesson promotion. Verification:
  focused core/gateway/API/CLI/Web/shared tests, package typechecks, storage
  typecheck, `git diff --check`, and CRG review.
- 2026-05-09 21:38: S5 docs and source smoke complete. Current docs now describe
  only the implemented local worker CLI/Web/daemon loop; successful daemon runs
  capture the final assistant output as an `assistant-output` artifact under
  `.aiworker/local/artifacts/runs/<runId>/`; `smoke:aiworker-run` now starts a
  temporary project, stub OpenAI-compatible executor, local daemon, real run,
  artifact list, review show, and lesson promotion. Verification passed:
  `bun run check`, `bun run build`, full CLI package tests, focused
  Core/API/Web tests,
  `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`, and
  `git diff --check`. Residual risk: `bun run --filter '@zonease/aiworker-core'
  test -- src/worker/orchestrator/service.history.test.ts` still has three
  pre-existing context-budget/compaction expectation failures outside the
  `taskId` artifact-capture path; do not claim full-suite production readiness
  until that historical suite is reconciled.
