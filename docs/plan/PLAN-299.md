# PLAN-299 Make Worker Web first-run Soul App first

- **status**: completed
- **createdAt**: 2026-05-13 18:17
- **approvedAt**: 2026-05-13 18:17
- **relatedTask**: REFACTOR-078

## Context

The approved UX direction is option A: Soul App first-run onboarding. The
current first screen exposes "no worker" as the main product state and places
Soul App diagnostics in the left rail. That matches the internal runtime model,
but not the product path confirmed in `GOALS.md`:

```text
Soul App -> Soul worker -> workspace/project -> session -> artifact/review
```

Investigation found the relevant surface in `apps/web/src/worker/worker-studio.tsx`,
with integration coverage in `apps/web/src/worker/__tests__/worker-studio.test.tsx`.
The existing creation APIs already support worker, workspace and session
creation; this work is a UX and flow re-composition, not a backend change.

## Proposal

1. Add first-run tests for the no-worker home:
   - main surface says "Choose a Soul App to start";
   - enabled HR/QA apps appear as start cards;
   - technical app details are hidden by default;
   - clicking HR opens the existing worker creation path with the HR Soul
     selected.
2. Refactor Worker Web home rendering:
   - if no workers exist, show a Soul App first-run panel in the main surface;
   - keep worker creation as the next step, but start from the app card;
   - keep existing worker/workspace/session routes unchanged.
3. Refactor Soul App rail rendering:
   - keep concise app readiness in the rail;
   - move route, permissions, mounted slots and surface details into a
     `Developer details` disclosure.
4. Verify with focused Worker Web tests, package build, mounted surface smoke,
   root gates and code-review-graph.

## Scope

In scope:

- Worker Web home and rail UX;
- existing worker creation dialog integration;
- localized copy for the changed first-run path;
- focused tests and browser verification.

Out of scope:

- backend API changes;
- automatic worker creation without user action;
- changing mounted Soul App protocol;
- redesigning non-empty worker workspaces or session chat.

## Risks

- **User path regression.** The first-run path must still create workers through
  `/api/local/workers` and route to the created worker.
- **Diagnostic loss.** Developer information is still useful, so it should be
  collapsed rather than removed.
- **Over-scoping.** This should not become a full navigation redesign.
- **Accessibility.** App cards and developer disclosure must have clear labels
  and keyboard-accessible controls.

## Verification

- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run web:smoke:mounted-surfaces`
- Browser smoke on the local first-run page
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-13 18:17: Created and claimed after user approved the Soul App
  first-run sketch.
- 2026-05-13 18:32: Implemented and verified. The no-worker home now shows
  enabled Soul App start cards, app technical details are hidden behind
  `Developer details`, and mounted-surface smoke follows the new disclosure.

## Verification Results

- Passed: `bun run --filter '@zonease/aiworker-web' test -- worker-studio`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `bun run test`
- Passed: `bun run build`
- Passed: `bun run web:smoke:mounted-surfaces`
- Passed: browser smoke on a temporary local daemon at `127.0.0.1:9327`
- Passed: `git diff --check`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`

`crg:review` exited 0 with overall risk score 0.40 and static test-gap hints;
the changed first-run and mounted-surface paths are covered by Worker Studio
tests plus browser smoke.
