# PLAN-323 HR Profile Ledger and Native Skills

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-15 02:23
- **relatedTask**: FEAT-085

## Decision

Implement the approved HR People Profile Ledger and Soul App-native skills
direction from
`docs/superpowers/specs/2026-05-15-hr-profile-ledger-native-skills-design.md`.

The product object is a People Profile. One profile item maps to one workspace.
`README.md` is the accepted profile, session artifacts are proposed changes,
human-approved revisions become profile commits, and optional tags can later mark
approved profile versions. Git remains internal plumbing; Worker Web uses HR
language such as Profile Revision, Proposed Change, Review Passed, and Approved
Version.

Native skills are app-owned source files under
`apps/<app-id>/skills/<skill-id>/SKILL.md`. The Host/runtime only performs a
static projection into workspace engine-native paths and records projection
metadata. A Soul App without skills remains valid.

## Investigation

- `packages/core/src/worker/executor.ts` starts external engines at
  `workspace.rootPath`; `LocalWorkerRuntime.startTurn(...)` passes
  `workspaceRoot` through the executor input.
- Existing runtime materializes session-local context under
  `.aiworker/sessions/<sessionId>/context/`, but this does not guarantee native
  engine skill discovery.
- `HostRuntime.createRuntimeForWorker(...)` can resolve the enabled
  `HostedSoulApp` for `worker.soulId` and pass static manifest-path source roots
  into the runtime.
- Current local daemon already has generic file, artifact, review, and workspace
  routes; adding profile read/promotion routes can stay Host-generic.
- Current HR workbench already has Candidate / Employee / Alumni projection in
  its model, but the visual center still over-emphasizes sources/artifact preview
  rather than the accepted profile summary.
- Baseline verification passed before implementation:
  - `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
  - `bun test --timeout=15000 apps/api/src/modes/worker.local.test.ts`
  - `bunx vitest run --testTimeout=15000 apps/web/src/worker/souls/hr/people-workbench/model.test.ts`

## Implementation Slices

1. PMA tracking and implementation plan.
2. Native skill projection from Soul App source roots into `.agents/skills` and
   `.claude/skills`.
3. Profile workspace ledger bootstrap with README, folders, ignore rules, and
   git initialization.
4. Profile revision promotion runtime plus local daemon API.
5. HR-native skills and HR profile-first Worker Web.
6. Focused/root verification, browser smoke, code-review-graph, PMA closeout,
   and commit.

## Verification Plan

- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun test --timeout=15000 apps/api/src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

If time allows after focused gates are green, broaden to root `bun run test` and
`bun run build`.

## Failure Handling

- If local `git` is unavailable, keep workspaces usable, return an explicit git
  unavailable status, and do not block workspace creation.
- If projection source roots are absent, no-op cleanly and keep the Soul App
  valid.
- If profile revision promotion receives `fail` or `needs_review`, reject the
  promotion endpoint rather than updating `README.md`.
- If Web tests become too broad for fast iteration, stabilize the focused HR
  model and affected Worker Studio tests first, then run the full Web build.
- If code-review-graph reports actionable risks, fix them before closeout.

## ActiveForm

- 2026-05-15 02:23: Plan opened after baseline investigation. Proceeding under
  user-authorized goal mode with Superpowers inline execution.
- 2026-05-15 02:39: Implementation slices 2-5 are green in focused tests:
  runtime projection/ledger, API profile promotion, HR skills validation, and
  Worker Web profile-first UI. Moving into focused gates, build, browser smoke,
  code-review-graph, and PMA closeout.
- 2026-05-15 02:45: Closed implementation after focused gates, root check/test/build,
  diff check, browser smoke, and code-review-graph review all completed. The
  only code-review-graph output is static helper/test-fixture gap reporting;
  the added runtime/API/Web behavior is covered by focused regression tests and
  browser smoke.
