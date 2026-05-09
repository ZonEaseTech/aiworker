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
- 2026-05-09 23:02: Added an execution checkpoint plan to PLAN-203 so the
  approved implementation can proceed as destructive, separately verifiable
  conventional commits across storage/contracts, core engine, daemon/API, CLI,
  Web, docs, smoke, and review.
- 2026-05-09 23:04: Added a removal/replacement inventory and prompt-to-artifact
  checklist to PLAN-203 after auditing current API, CLI, Web, storage, core,
  and shared old surfaces.
- 2026-05-09 23:06: Re-read Open Design daemon, project file, and SQLite
  metadata anchors, then added an explicit reference mapping to PLAN-203 so the
  rebuild copies the local workspace product intention without importing
  image/video-domain concepts.
- 2026-05-09 23:07: Added a completion audit command matrix to PLAN-203 with
  positive surface scans, negative removal scans, focused package gates, full
  gates, CRG, and fresh source-local smoke requirements.
- 2026-05-09 23:09: Ran the audit matrix as a pre-implementation baseline and
  recorded the failure snapshot in PLAN-203: no `/api/local/*` surface yet, and
  old route/API, persistence, runtime, CLI, and Web legacy matches remain.
- 2026-05-09 23:10: Added the PLAN-203 implementation status board. All B1-B6
  batches are explicitly `blocked_pending_approval` with entry files, blocking
  conditions, and evidence slots.
- 2026-05-09 23:12: Added a greenfield contract draft to PLAN-203 covering the
  minimal domain entities, `/api/local/*` route groups, CLI command contract,
  and Worker Web information architecture.
- 2026-05-09 23:13: Added a ready-to-implement handoff to PLAN-203 that starts
  from B1 storage/shared contracts after approval and requires per-batch status
  and evidence updates before moving forward.
- 2026-05-09 23:20: Began B1 storage/shared contracts implementation from the
  approved greenfield scope.
- 2026-05-09 23:31: Completed B1 storage/shared contract implementation:
  replaced the worker schema with greenfield workspace/brief/run/file/artifact/
  review/lesson/settings tables, regenerated worker migrations from scratch, and
  verified focused storage/shared gates.
- 2026-05-09 23:43: Completed B2 core runtime replacement: deleted the old
  worker runtime subsystems and introduced a minimal local run engine that
  persists briefs, run events, generated files, artifacts, reviews, and lessons.
