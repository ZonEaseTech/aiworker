# PLAN-345 HR native skill closure follow-ups

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17 12:00
- **approvedAt**: 2026-05-17 12:00
- **completedAt**: 2026-05-17
- **relatedTasks**: BUG-129, TODO-043, TODO-044

## Context

`QA-035 / PLAN-344` proved the HR native skill README closure loop with real
Codex CLI sessions, but it left three follow-ups:

- Failed external-engine turns can write durable files under
  `artifacts/<sessionId>/` and still return no indexed artifacts when the
  engine exits non-zero.
- HR native skill outputs are still collapsed into the two manifest capability
  output kinds `person-profile` and `candidate-screen`, even though the product
  workbench and native skills use more precise concepts such as
  `interview-brief`, `evidence-matrix`, `hiring-risk`, and
  `profile-update-proposal`.
- Projected workspaces show capability `promptRef` / `reviewRubricRef` hints,
  but external engines cannot read those app source files from the workspace.

Investigation confirmed the ownership boundaries:

- `BUG-129` belongs to Host runtime/executor plumbing. Host should salvage
  generic artifact descriptors without interpreting HR content.
- `TODO-043` belongs to the HR Soul App manifest plus shared official fixture
  alignment. HR owns the artifact taxonomy; Host only records output kinds.
- `TODO-044` belongs to shared app capability projection and Host runtime
  session materialization. The prompt/review content remains app-owned source
  material; Host only projects it as session context for the selected engine.

## Proposal

1. Add failing executor/runtime tests for partial artifact recovery when a local
   engine writes an artifact and exits non-zero.
2. Implement a typed local executor failure carrying partial artifacts,
   metadata, and needs-review state. Runtime catch handling should register the
   recovered files/artifacts/review while keeping turn and invocation status
   `failed`.
3. Expand HR app artifact types and capabilities for native skill outputs:
   `evidence-matrix`, `interview-brief`, `hiring-risk`, and
   `profile-update-proposal`, while preserving `person-profile` and
   `candidate-screen`.
4. Keep the app manifest and `packages/shared/src/soul-app/fixtures.ts`
   aligned, including permissions and tests.
5. Materialize capability prompt and review content into session context when
   Host metadata provides it. External engines should see the full content in
   the invocation prompt and under `.aiworker/sessions/<id>/context/capability/`
   without Host interpreting domain semantics.

## Scope

- `packages/core/src/worker/executor.ts`
- `packages/core/src/worker/runtime.ts`
- focused runtime/executor/host/registry tests
- `apps/aiworker-hr/soul-app.manifest.json`
- `packages/shared/src/soul-app/fixtures.ts`
- HR product artifact schemas/review/workflow assets only as lightweight
  reusable policy files when needed by manifest refs
- PMA task/plan/changelog records

## Risks

- Artifact recovery must not make a failed engine turn look completed. The
  returned turn and invocation remain `failed`; recovered artifacts require
  human review before promotion.
- Adding HR capability IDs changes the official app catalog. Existing
  `person-profile` / `candidate-screen` IDs must stay stable.
- Prompt/review materialization can duplicate text in session context. Keep it
  capability-scoped and app-authored, not Host-authored semantics.

## Verification

- Executor test: failed local CLI writes an artifact, exits non-zero, and
  exposes recoverable partial artifacts.
- Runtime test: failed turn returns indexed artifact/review while status stays
  failed.
- Shared/registry/host tests prove HR first-class capabilities and prompt/review
  materialization metadata.
- HR app validation and focused package typecheck/tests pass.
- `git diff --check`, `bun run crg:update`, and `bun run crg:review` pass.

## Outcome

Completed all three follow-ups:

- `BUG-129`: local external-engine failures now support a typed partial result.
  If the engine wrote artifacts before exiting non-zero, runtime registers the
  recovered file, artifact, and `needs_review` record while keeping the turn and
  invocation status `failed`.
- `TODO-043`: HR now declares first-class artifact types and capability output
  kinds for `evidence-matrix`, `interview-brief`, `hiring-risk`, and
  `profile-update-proposal`, with app-owned schema, review, and workflow assets.
- `TODO-044`: Host metadata enrichment reads app-authored capability prompt and
  review assets from manifest-path Soul Apps, and worker runtime materializes
  them into `.aiworker/sessions/<id>/context/capability/` plus invocation
  prompts for external engines.

## Evidence

- `bun run --filter '@zonease/aiworker-core' test src/worker/executor.test.ts src/worker/runtime.test.ts src/host/runtime.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
