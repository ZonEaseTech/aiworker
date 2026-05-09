# REFACTOR-037 Greenfield local worker rebuild

- **status**: in_progress
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-09 22:47
- **claimedAt**: 2026-05-09 22:47
- **plan**: PLAN-203
- **relatesTo**: REFACTOR-026, REFACTOR-036, PLAN-192, PLAN-202, GOALS.md, DESIGN.md, docs/architecture.md, apps/cli, apps/api, apps/web, packages/core, packages/storage-sqlite, packages/shared

## Background

REFACTOR-036 removed many old default entry points, but the result still feels
like a legacy worker/admin system with renamed surfaces. The user's expectation
is a no-reservations, new-project-style rebuild that uses Open Design as the
product reference, not another compatibility cleanup.

## Investigation Findings

- The worker API bootstrap still mounts legacy-era subsystems:
  `/api/worker/brain`, `/api/worker/evolution`, channel webhooks,
  orchestrator task/conversation routes, management config/secrets/approvals,
  and OpenAPI doc registrations for `/schedule`, `/approvals`, `/brain/*`,
  and `/orchestrator/conversations/*`.
- The worker Web shell navigation was simplified, but the data layer still
  imports hooks and clients for Brain admissions, cron, secrets, approvals,
  brain tests, channel tests, conversation messages, and task journals.
- `worker.db` still carries multi-generation schema concepts:
  `conversations`, `session_entries`, `messages`, `execution_logs`,
  `skill_bindings`, `skill_drafts`, `evolution_observations`,
  `brain_journal_events`, `brain_artifacts`, `brain_admission_proposals`,
  `brain_admission_decisions`, and `cron_jobs`.
- Core runtime still centers on a large orchestrator plus decision pipeline,
  conversation router, channel registry, cron service, approvals, evolution
  observer/proposer, brain summary, and management surfaces. This is the old
  runtime with a new front door, not a new product kernel.
- Open Design's reference shape is materially different: a daemon owns local
  projects, file trees, conversations, messages, comments, tabs, generated
  files, and deployments under one project workspace. The value is not a
  generic admin dashboard; it is a local creative workspace loop around
  project files and generated artifacts.

## Goal

Rebuild AIWorker's local worker as a greenfield workspace product:

```text
workspace -> brief -> run -> files/artifacts -> review -> lessons
```

The next implementation must delete or isolate old worker admin/runtime layers
instead of hiding them. Fleet, gateway, remote channels, cron, generic brain
admin, and compatibility routes are out of the default local worker product.

## Acceptance Criteria

- A fresh local worker starts without any visible Brain/Admin/Channel/Cron/
  Approval/Fleet/Gateway mental model.
- The persisted local data model is rebuilt around workspace projects, briefs,
  runs, files/artifacts, reviews, lessons, and settings only.
- Worker Web looks and behaves like a first-class workspace app, not an admin
  dashboard with status cards.
- Worker API is a small local workspace API, not a broad management API.
- CLI is a launcher and automation shell for the new workspace loop, not a
  compatibility surface over old runtime subsystems.
- Old routes/modules/tests that only preserve pre-1.0 semantics are deleted,
  not wrapped.
- Verification includes focused tests, full source gates, source-local smoke,
  and CRG review before completion.

## Completion Audit

Before this task can be marked complete, PLAN-203's completion audit must be
filled with current evidence for product reset, removed compatibility surface,
persistence reset, runtime reset, API reset, Web reset, CLI reset, smoke proof,
and review proof.

## Non-goals

- No desktop/Electron scope in this task.
- No Fleet/Gateway feature work.
- No migration from old local worker databases; pre-1.0 destructive reset is
  allowed.
- No compatibility aliases, shims, or hidden old admin pages.

## Progress

- 2026-05-09 22:47: Created after user review found REFACTOR-036 still far from
  the expected greenfield rebuild. Investigation confirmed that the old data
  model, API, runtime, and Web data layer remain the main blocker.
