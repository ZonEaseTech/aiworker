# REFACTOR-060 Worker Web visual token and control convergence

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 03:05
- **plan**: PLAN-238
- **relatesTo**: DESIGN.md, apps/web/src/worker/studio.css, apps/web/src/worker/worker-studio.tsx

## Background

Worker Web currently mixes an older warm/accent visual system with the current
`DESIGN.md` direction. The most visible drift is in padding, margins, radius,
shadow, accent colors, and form controls. Native `select` elements also do not
share the same input geometry as text inputs and textareas.

## Goal

Converge Worker Web onto the `DESIGN.md` visual language without replacing the
existing worker-first interaction model.

## Acceptance Criteria

- CSS tokens map to the `DESIGN.md` black / white / neutral palette and
  pill-first interactive geometry.
- `input`, `select`, and `textarea` share consistent height, padding, border,
  radius, font, focus, disabled, and placeholder behavior.
- Buttons and icon buttons use consistent pill sizing and spacing.
- Card-like surfaces use hairline borders and the approved radius scale without
  gradients, decorative shadows, or leftover warm accent styling.
- Focus states remain visible and accessible.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser visual smoke on desktop and mobile.
- code-review-graph review after code edits.

## Closeout

- Worker Web tokens now use the `DESIGN.md` black / white / neutral palette and
  terminal status colors.
- `input`, `select`, and `textarea` share pill-first control styling, focus
  states, disabled behavior, and placeholder treatment.
- Gradients and decorative shadows were removed from the touched Worker Web
  surfaces; CSS build quality check passed.
