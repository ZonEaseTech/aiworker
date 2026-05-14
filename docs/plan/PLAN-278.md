# PLAN-278 HR People Profile Workbench

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 13:57
- **approvedAt**: 2026-05-12 13:57
- **completedAt**: 2026-05-12 14:28
- **relatedTask**: REFACTOR-071

## Current State

The current HR specialized workbench is an evidence-first Role Search Cockpit.
It is useful for recruiting, but it keeps the role search as the top-level
mental model. That leaves two product gaps:

- a real HR workspace must track people across lifecycle moments, not only open
  recruiting loops;
- the user still needs a clearer closed loop from person profile to next step,
  agent proposal, review, and memory/lesson.

The existing architecture is still valid: workbench descriptors select the HR
specialized UI while the local daemon, worker, workspace, session, artifact,
review, and lesson contracts remain shared.

## Decision

Make HR's first specialized workbench a People Workbench:

```text
Lifecycle filters | Profile poster wall | Profile loop panel
```

The UI treats each workspace as a lightweight person/profile workspace for now.
That keeps this slice portable and avoids a schema fork. Role search remains a
lifecycle/use-case inside HR, not the default frame.

## Scope

In scope:

- Update the HR workbench descriptor from role-search-first to people-first.
- Add the minimal HR capability templates needed for profile, lifecycle,
  onboarding, and offboarding proposals.
- Replace the HR specialized UI with:
  - lifecycle filters;
  - flex profile poster wall;
  - selected profile loop panel;
  - timeline/status loop;
  - proposal composer tied to the selected profile/workspace.
- Update i18n copy and focused WorkerStudio/shared tests.
- Run focused logic/build checks and Playwright UX validation.

Out of scope:

- Real HRIS/ATS connector implementation.
- Dedicated HR profile database schema.
- Automated employment decisions or ranking.
- Specialized PM/QA/DevOps workbenches.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' test -- src/vertical-soul.test.ts src/soul-workbench.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright desktop and mobile checks for HR People Workbench.
- Playwright interaction check for HR action-to-composer and PM fallback.
- `bun run crg:update`
- `bun run crg:review`

## Risks

- **Over-broad HR surface**: HR can become a full HRIS clone. Mitigation: this
  slice only changes the workbench mental model and proposal loop.
- **Pretty profile wall without workflow value**: poster cards can become visual
  decoration. Mitigation: every card must show lifecycle stage, evidence,
  review, and next-step status.
- **Session linkage remains implicit**: users may not see how agent output feeds
  the workbench. Mitigation: the right panel shows profile timeline and proposal
  composer next to the selected profile.
- **Existing recruiting value regresses**: role search artifacts still matter.
  Mitigation: keep recruiting templates/actions as HR lifecycle actions under
  the people-first frame.

## Progress

- 2026-05-12 13:57: Claimed and started implementation after operator approved
  goal-mode development, logic tests, and UI tests.
- 2026-05-12 14:28: Completed the people-first HR workbench implementation:
  shared descriptor/template updates, localized WorkerStudio integration,
  responsive profile poster layout, profile loop panel, and profile-bound agent
  proposal actions.
- 2026-05-12 14:28: Completed verification with focused shared/Web/API tests,
  Web/shared/root typecheck, Web/root lint, Web build, Playwright desktop/mobile
  UX checks, HR action-to-composer flow, PM fallback validation,
  `git diff --check`, and code-review-graph update/review.
- 2026-05-12 14:49: Applied the UX follow-up that removes the duplicated
  lifecycle selector from the left rail; Playwright confirmed the header strip
  is the only lifecycle filter and mobile layout remains overflow-free.
- 2026-05-12 15:43: Applied defect fixes from the HR flow rehearsal:
  `needs_review` no longer renders as reviewed, needs-review profiles remain in
  the attention set, and worker-route proposal submissions now navigate to the
  created session. Playwright reran a fresh candidate flow through
  person-profile and interview-brief artifacts.
