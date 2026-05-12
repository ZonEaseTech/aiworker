# REFACTOR-072 Vertical Soul Workbench Module Architecture

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 16:38
- **claimedAt**: 2026-05-12 16:38
- **completedAt**: 2026-05-12 17:34
- **plan**: PLAN-280
- **relatesTo**: REFACTOR-068, REFACTOR-071, BUG-116, apps/web

## Background

HR People Workbench proved the vertical Soul direction, but the first
implementation still concentrates the specialized renderer, HR business
projection, UI blocks, copy, and styles in a single Worker Web slice.

The next Soul should be able to start from a stable module contract instead of
copying HR or refactoring WorkerStudio again.

## Goals

- Establish a repeatable `worker/souls/<soul>/<workbench>/` module shape.
- Keep WorkerStudio as the generic shell and route specialized workbenches
  through a small renderer registry.
- Extract common workbench primitives that are already shared by HR blocks.
- Move HR-specific model, copy, components, and styles under the HR module.
- Add focused model tests so lifecycle/review/action rules are not only tested
  indirectly through WorkerStudio.

## Non-goals

- Do not build a remote plugin runtime or schema-driven renderer.
- Do not specialize PM, QA, DevOps, finance, legal, or ops in this slice.
- Do not change the local daemon, DB schema, session, artifact, review, or lesson
  contracts.
- Do not redesign the HR People Workbench layout or product behavior.

## Acceptance Criteria

- WorkerStudio no longer imports HR renderer directly or checks HR workbench ids
  inline.
- Specialized workbench renderers receive a stable shared context contract.
- HR People Workbench is split into module-local container, model, copy, and
  component files.
- Common section/status primitives are reusable outside HR.
- Existing HR user flows keep rendering the same workbench behavior.
- Focused tests cover HR lifecycle/status/action projection logic.

## Progress

- 2026-05-12 16:38: Claimed after operator requested architecture-first
  modularization so the next Soul can be built on the same foundation without
  another large refactor.
- 2026-05-12 17:34: Completed the module architecture refactor. WorkerStudio now
  routes specialized workbenches through a compile-time renderer registry and a
  shared `SoulWorkbenchContext`. HR People Workbench is split into module-local
  container, components, model, copy, types, styles, and model tests, with small
  common workbench section/status primitives extracted for future Souls.
- 2026-05-12 17:34: Verification passed for focused HR model and WorkerStudio
  tests, Web typecheck, lint, build, `git diff --check`, Playwright HR
  desktop/mobile UX checks, PM fallback smoke, and code-review-graph
  update/review.
