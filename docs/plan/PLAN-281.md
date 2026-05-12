# PLAN-281 HR People Workbench Focus Layout and Artifact Preview

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 17:52
- **approvedAt**: 2026-05-12 17:52
- **completedAt**: 2026-05-12 18:18
- **relatedTask**: REFACTOR-073

## Current State

REFACTOR-072 created the vertical Soul module architecture. HR now has separated
container, components, model, copy, styles, and tests.

The current UI still has two product issues:

- the central profile wall is visually small while the surrounding rail and loop
  panel compete for attention;
- the right-side action stack and composer use mixed interaction weights, making
  the next step harder to identify.

The operator also requested artifact Markdown preview inside the HR workbench.

## Decision

Keep the existing HR module architecture and rebalance the view:

```text
Header command strip
Main work center
  - profile selector wall
  - selected profile dossier
  - safe Markdown artifact preview
Right action composer
  - suggested next action
  - secondary actions
  - artifact target and context
  - generate CTA
```

Put Markdown preview in `packages/component` as a shared artifact preview
primitive. Use `react-markdown` with `remark-gfm` for preview rendering. Do not
use `rehype-raw`; set `skipHtml` so untrusted artifact HTML is removed.

## Scope

In scope:

- Add component-package dependencies `react-markdown` and `remark-gfm`.
- Add a reusable Markdown preview component under `packages/component`.
- Pass the current artifact preview state into the specialized workbench context.
- Replace the HR internal rail/loop layout with a central dossier plus right
  action composer.
- Update HR CSS for clear visual hierarchy and consistent action controls.
- Extend focused tests for rendered Markdown preview and action flow.

Out of scope:

- Markdown editing.
- Raw HTML rendering or rehype raw plugins.
- Backend file/content API changes.
- Specializing non-HR Souls.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright desktop/mobile HR layout review.
- Playwright HR artifact preview smoke.
- Playwright PM fallback smoke.
- `bun run crg:update`
- `bun run crg:review`

## Risks

- **Preview XSS**: artifacts can contain arbitrary Markdown. Mitigation:
  `react-markdown` with `skipHtml`, no `rehype-raw`.
- **Overweight dependency**: a full editor would be excessive. Mitigation:
  install renderer-only `react-markdown` and `remark-gfm`.
- **Layout overcorrection**: removing the rail could hide source/review context.
  Mitigation: move dossier, timeline, guardrails, and preview into the central
  work center.
- **Regression from context expansion**: specialized workbench context gains
  preview state. Mitigation: keep it read-only and covered by WorkerStudio
  tests.

## Progress

- 2026-05-12 17:52: Plan created and implementation started after approval.
- 2026-05-12 18:10: Corrected preview ownership from app-local to
  `packages/component`; focused HR tests now pass with the shared preview
  component.
- 2026-05-12 18:18: Completed implementation and verification. Playwright
  review changed the responsive order so mobile users reach the action composer
  before the long dossier/preview surface.
