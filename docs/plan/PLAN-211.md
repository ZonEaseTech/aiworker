# PLAN-211 End-to-end vertical Soul MVP validation

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 10:30
- **completedAt**: 2026-05-10 10:46
- **relatedTask**: QA-026

## Current State

Plans 208-210 establish the MVP slices, but the user-facing acceptance depends
on the combined local flow working from a clean workspace.

## Proposal

Validate the merged behavior:

1. Run focused tests/typecheck/lint/build for changed packages.
2. Run feasible root gates.
3. Start local daemon/API and Web preview.
4. Exercise Soul selection, template selection, case/run creation, artifact
   visibility, Settings autosave, Settings close/reopen, and reload persistence
   in browser.
5. Run code-review-graph after code edits and record the result.

## Implementation Status

Completed. Focused package gates, root gates, browser validation, screenshot,
and code-review-graph review all completed. Evidence is recorded in QA-026.
