# REFACTOR-066 Component package library structure

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 13:51
- **plan**: PLAN-249
- **relatesTo**: packages/component, apps/web

## Background

`packages/component` was introduced during REFACTOR-065, but its first form was
still a single `studio.tsx` file with Worker Web-specific extraction. That
created a package boundary without a real component-library architecture.

## Goal

Convert `packages/component` into a reusable component library with primitive,
layout, pattern, and compatibility layers, then update Worker Web surfaces to
consume the library primitives instead of hand-rolling base UI elements.

## Acceptance Criteria

- Split `packages/component/src` into `primitives`, `layout`, `patterns`,
  `studio`, and `utils` modules.
- Provide primitives for button, card/action-card, dialog, field, header, nav,
  badge, and select.
- Keep compatibility exports for existing Worker Web imports.
- Replace representative Worker Web button/card/field/nav usage with component
  package primitives.
- Preserve Worker Web behavior and visual class contracts.
- Run focused Web gates and code-review-graph before closure.

## Verification

- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run check`
- `git diff --check`
- Browser verification on `http://127.0.0.1:9217/worker/`
- `bun run crg:update`
- `bun run crg:review`
- code-review-graph result: risk score `0.40`, 0 affected flows. Reported
  gaps are the refactored UI components already covered by WorkerStudio RTL
  tests, Web build, and browser startup verification.
