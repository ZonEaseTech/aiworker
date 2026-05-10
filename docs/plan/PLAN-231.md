# PLAN-231 Structured session end-to-end validation

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 22:05
- **relatedTask**: QA-030

## Current State

The reported browser screenshot shows the broken behavior: a session turn
mostly renders a collapsed stderr block and then fails when no artifact file is
found. After PLAN-228 through PLAN-230, the product must be validated in the
actual daemon/Web loop, not only through unit tests.

## Proposal

1. Build the Web bundle.
2. Start the local daemon from the source checkout with the current user HOME
   and isolated AIWorker state.
3. Open `http://127.0.0.1:9327/`.
4. Exercise Soul workspace session continuation with Codex CLI.
5. Confirm structured engine process events, text response, artifact indexing,
   and Settings engine scan/test.
6. Run CRG update/review and commit the work.

## Verification Plan

- Focused core/API/Web gates from PLAN-228 through PLAN-230.
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
- Browser validation on desktop and narrow viewport.

## Result

- Built Web/API/CLI bundles and started local daemon from the source checkout at
  `http://127.0.0.1:9327/`.
- Browser validation created a clean HR / Candidate Screen session with real
  Codex CLI. The route changed to the workspace session within 10 seconds, and
  the timeline then streamed status, Bash tool events, file-change status,
  assistant text, artifact, and review.
- Verified the persisted event trail has zero raw JSON records for the Codex
  turn and one indexed candidate-screen artifact.
- Desktop (`1440x1000`) and narrow (`390x844`) viewport checks confirmed no
  horizontal overflow and reachable session controls.
