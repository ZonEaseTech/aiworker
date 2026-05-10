# PLAN-241 Worker Web visual polish validation

- **status**: pending
- **owner**: unassigned
- **createdAt**: 2026-05-11 03:05
- **relatedTask**: QA-032

## Current State

- Recent Worker Web work validated the worker-first product flow, but the new
  request is a visual and interaction polish pass against `DESIGN.md`.
- The primary risk is inconsistent design-token application across routes,
  forms, dialogs, and responsive states.

## Proposal

1. Run focused Web gates after each implementation slice.
2. Run a final validation pass covering:
   - worker list and create worker dialog;
   - workspace list and create workspace dialog;
   - workspace create-session form and select controls;
   - session composer;
   - session scroll behavior while pinned, while reading previous output, and
     after switching sessions;
   - right drawer expanded/collapsed states;
   - settings dialog controls.
3. Validate mobile at a narrow viewport for overflow, usable icon buttons, and
   readable dialogs.
4. Run code-review-graph before final closeout and record its conclusion.
5. Commit in stages when a slice is complete and verified.

## Scope

In scope:

- Focused Worker Web test and build gates.
- Browser validation through local dev server or existing local daemon.
- `git diff --check`.
- code-review-graph update/review.
- PMA task/plan/changelog closeout.

Out of scope:

- Release publishing.
- Full cross-package validation unless a Web change unexpectedly touches shared
  contracts.
- PR creation unless explicitly requested later.

## Risks

- Browser validation may need a local daemon with usable worker data. If the
  current daemon state is unsuitable, use an isolated `AIWORKER_HOME` smoke
  environment.
- Existing local auth/runtime state can make visual validation noisy; record
  exact URL and evidence.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser desktop and mobile validation.
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Pending operator approval.
