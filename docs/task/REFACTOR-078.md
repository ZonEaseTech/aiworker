# REFACTOR-078 Make Worker Web first-run Soul App first

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 18:17
- **plan**: PLAN-299
- **relatesTo**: apps/web, Worker Web, Soul App first-run onboarding

## Description

Worker Web home currently shows an empty worker state and exposes technical
Soul App mount details before it gives users a clear starting path. Rework the
first-run home so users start from enabled Soul Apps, then create the worker,
workspace and session through an explicit business flow.

Acceptance criteria:

- When there are no workers, the main home surface is Soul App first and shows
  enabled HR/QA apps as clear start cards.
- Starting a Soul App creates a worker, then guides the user to create a
  workspace and select an initial capability.
- Technical Soul App details such as API route, permissions and mounted slots
  are hidden behind a developer details disclosure instead of filling the
  first-run rail.
- Existing worker, workspace and session routes keep working.
- Focused Worker Web tests, build and browser smoke verify the new path.

## ActiveForm

Improving Worker Web first-run onboarding so the default product path is Soul
App -> worker -> workspace -> session instead of an unexplained empty worker
screen.

## Notes

- 2026-05-13 18:17: Created after the first-run screenshot showed that users
  cannot tell what to do on the home page even though HR/QA Soul Apps are
  enabled.
- 2026-05-13 18:32: Completed. Worker Web first-run now starts from enabled
  Soul App cards, Developer details hides mounted diagnostics by default, and
  the HR start action opens the create-worker dialog with HR preselected.

## Verification

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
