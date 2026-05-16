# FEAT-093 HR Profile Reading Room

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-17
- **plan**: PLAN-340
- **spec**: docs/superpowers/specs/2026-05-17-hr-profile-reading-room-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-17-hr-profile-reading-room.md
- **relatesTo**: apps/aiworker-hr, apps/web/src/worker/souls/hr/people-workbench, packages/core/src/worker/profile-ledger.ts

## Context

AIWorker HR already treats `README.md` as the accepted People Profile, but the
current workbench presents sources, proposed changes and review guardrails as
peer center-column cards. Users cannot immediately focus on the accepted
profile summary.

## Goals

- Define a plain Markdown HR README base-section contract.
- Render the accepted README as the center-column Reading Room.
- Keep the existing three-column full-height layout with independent scroll.
- Collapse the right tools column into an icon rail by default.
- Preserve review-gated profile promotion.

## Non-Goals

- Do not make README depend on HTML, frontmatter or Web-only layout metadata.
- Do not build a block editor.
- Do not remove artifacts, reviews, sessions or lessons.
- Do not let Host infer HR profile meaning outside the HR workbench renderer.

## Acceptance Criteria

- New HR workspaces seed README with identity, role, capability, evidence,
  risk, next-action, review and accepted-external-section headings.
- The HR workbench center column foregrounds `Current Profile Summary` and
  person/profile base sections.
- Sources, proposed changes, guardrails and sessions are available from the
  right rail/drawer but not shown as peer center cards by default.
- Desktop layout keeps profile list, reading room and tools rail/drawer as
  full-height independently scrolling columns.
- Profile promotion still writes `README.md` only through review.

## Verification

- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-17: Claimed for HR Profile Reading Room implementation after the
  Superpowers design spec was approved.
- 2026-05-17: Completed the HR profile-first Reading Room. README now has a
  plain Markdown base-section contract, the center column renders accepted
  profile sections, and sources/proposed changes/guardrails/sessions move into
  the right tools rail/drawer without removing the third column.
- 2026-05-17: Verification passed: focused core runtime test, focused HR Web
  tests, Web typecheck, Web build/CSS gate, project `bun run check`,
  `git diff --check`, code-review-graph update/review, and a browser smoke
  against an isolated HR worker/workspace.
