# PLAN-223 Session workspace MVP validation

- **status**: implementing
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **relatedTask**: QA-029

## Proposal

Validate the refactor end to end:

1. Run shared/storage/core/API/Web/CLI/fs-layout focused gates.
2. Run feasible root `typecheck`, `lint`, `test`, and `build` gates.
3. Run code-review-graph update/review after code changes.
4. Start the local daemon and serve Worker Web through a local preview path.
5. Use browser automation to verify the Soul worker catalog, session creation,
   artifact display, Settings persistence, and absence of import/case/run
   product entrypoints.

## Scope

Verification, browser proof, documentation evidence, and final commits.

## Status

Implementing.
