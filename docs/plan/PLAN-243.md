# PLAN-243 Worker Web interaction polish validation

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 10:38
- **relatedTask**: QA-033

## Current State

The local 9217 daemon is available for browser validation. User-provided
screenshots and Playwright MCP inspection identify issues in dialog spacing,
select rendering, Soul empty state, button contrast, workspace alignment,
session navigation, and streaming route control.

## Proposal

1. Use Playwright MCP to inspect before and after states across desktop and
   mobile.
2. Validate critical routes:
   - `/`
   - create worker dialog and select menu
   - no-worker empty state through mocked data or direct DOM route where needed
   - workspace route
   - session route
   - route changes during streaming
3. Record all focused command gates and CRG results in task/plan/changelog
   closeout.

## Scope

In scope:

- Browser inspection and screenshots only when useful.
- Focused Web automated gates.
- CRG review.

Out of scope:

- Full release validation.
- Published package harnesses.

## Risks

- The 9217 daemon contains local mutable data, so some states may need test or
  API-driven setup instead of relying on the current database.
- Browser screenshots alone are insufficient; combine Playwright inspection
  with automated tests for route behavior.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright MCP desktop/mobile validation
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Approved by operator on 2026-05-11 in the manual-feedback request.

## Result

Completed on 2026-05-11.

- Playwright MCP validated the 9217 desktop route, create worker dialog, custom
  select listbox, workspace route, session route, and 390px mobile viewport.
- Browser inspection confirmed the built CSS only exposes `DESIGN.md` token
  font sizes/weights and `letter-spacing: 0px`; it also confirmed native
  `select` count `0` and no horizontal overflow.
- Mobile workspace route validation found and then confirmed the fix for the
  create-session/empty-state overlap.
- Focused automated tests cover custom select selection, vertical no-worker
  Soul selection, session return-to-workspace visibility, and the no-forced
  navigation stream guard.
- code-review-graph update and review completed with 0 affected flows.
