# REFACTOR-073 HR People Workbench Focus Layout and Artifact Preview

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 17:52
- **claimedAt**: 2026-05-12 17:52
- **completedAt**: 2026-05-12 18:18
- **plan**: PLAN-281
- **relatesTo**: REFACTOR-071, REFACTOR-072, BUG-116, apps/web

## Background

The modular HR People Workbench still has a visual-focus issue. The profile wall,
source rail, and right loop panel occupy similar weight, leaving the primary
work center unclear. The action area also mixes button and panel styles, so the
user cannot quickly separate profile review, artifact preview, and next action.

The operator also requested Markdown artifact preview inside the HR workbench.

## Goals

- Rebalance the HR layout around a clear central work surface.
- Replace the internal left rail with a selected-profile dossier inside the main
  work center.
- Consolidate right-side actions into a consistent action composer panel.
- Add safe Markdown preview for selected HR artifacts through the shared
  component package using `react-markdown` plus `remark-gfm`.
- Preserve the current HR session/artifact/review/lesson contracts.

## Non-goals

- Do not change backend artifact indexing, file storage, or session APIs.
- Do not add a Markdown editor.
- Do not render raw HTML from artifacts.
- Do not redesign non-HR Soul fallback workbenches.

## Acceptance Criteria

- HR desktop layout presents profile selection, selected-profile dossier, and
  action composer with a clear visual hierarchy.
- The selected-profile dossier previews the latest artifact as rendered
  Markdown when content is available, with loading/error/empty states.
- Action buttons and composer controls share one visual grammar.
- HR action-to-composer flow still works.
- PM/QA/DevOps fallback remains unchanged.
- Tests and Playwright cover the focused HR layout and Markdown preview path.

## Progress

- 2026-05-12 17:52: Claimed after operator confirmed the focus-layout direction
  and requested Markdown artifact preview component selection.
- 2026-05-12 18:10: Moved Markdown preview ownership to
  `packages/component`, then wired HR to consume it as a shared artifact preview
  primitive.
- 2026-05-12 18:18: Completed the focused layout: profile wall, central
  dossier with Markdown artifact preview, mobile action-before-dossier order,
  and consistent action composer all verified.

## Verification

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright desktop HR layout review.
- Playwright mobile HR layout review.
- Playwright HR action-to-composer smoke.
- Playwright HR Markdown artifact preview smoke.
- Playwright PM fallback smoke.
- `bun run crg:update`
- `bun run crg:review`
