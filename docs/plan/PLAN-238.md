# PLAN-238 Worker Web design token and control convergence

- **status**: pending
- **owner**: unassigned
- **createdAt**: 2026-05-11 03:05
- **relatedTask**: REFACTOR-060

## Current State

- `DESIGN.md` specifies a paper-white, black/neutral, pill-first visual system:
  white canvas, black primary actions, neutral text, `rounded.full` interactive
  controls, hairline borders, and no gradients or decorative shadows.
- `apps/web/src/worker/studio.css` still uses warm canvas colors, orange accent
  states, gradients, multiple radius values, and shadow-heavy active states.
- Global form styling covers `input` and `textarea`, but not `select`; current
  select usage relies on `.ds-select` and does not match the text-input token.
- Control sizing varies between 22px, 28px, 30px, 34px, and 40px icon/button
  treatments without a clear hierarchy.

## Proposal

1. Introduce a small set of Worker Web design tokens aligned to `DESIGN.md`:
   canvas, soft surface, card surface, hairline, strong hairline, ink, body,
   mute, dark surface, focus ring, radius small/medium/large/pill, and spacing
   steps.
2. Normalize global controls:
   - `input`, `select`, and `textarea` share border, radius, padding, text,
     disabled, placeholder, and focus behavior;
   - select uses a consistent right-side chevron affordance without ad hoc
     component-level styling;
   - icon buttons and primary/secondary buttons use pill geometry and stable
     target sizes.
3. Remove visual drift that conflicts with `DESIGN.md`: gradients, warm accent
   backgrounds, elevated card shadows, and inconsistent rounded rectangles.
4. Keep the current route structure and interaction model intact. This is a
   visual foundation slice, not a product rebuild.

## Scope

In scope:

- `apps/web/src/worker/studio.css`
- Minimal className adjustments in `apps/web/src/worker/worker-studio.tsx` if
  required to share control styles.
- Focused test updates only when accessible names or form roles change.

Out of scope:

- Changing API contracts.
- Changing worker/workspace/session route semantics.
- Replacing existing React component structure wholesale.

## Risks

- A token rewrite can accidentally flatten state meaning. Active, disabled,
  blocked, and ready states must remain distinguishable while using neutral
  `DESIGN.md` styling.
- Native select styling differs by browser. The implementation should use
  robust CSS rather than relying on unsupported custom option rendering.
- Dark mode currently exists. If full dark-mode parity conflicts with
  `DESIGN.md`, keep it functional and neutral rather than expanding the visual
  system.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser smoke: home route, workspace route, session route, settings dialog,
  desktop and mobile.
- code-review-graph update/review after code edits.

## Approval Gate

Pending operator approval.
