# PLAN-280 Vertical Soul Workbench Module Architecture

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 16:38
- **approvedAt**: 2026-05-12 16:38
- **completedAt**: 2026-05-12 17:34
- **relatedTask**: REFACTOR-072

## Current State

The product direction is clear: AIWorker should expose specialized vertical Soul
workbenches while preserving the shared local worker/session/artifact/review
path.

The current implementation proves the HR People Workbench, but its architecture
is still first-slice shaped:

- `WorkerStudio` imports `HrPeopleWorkbench` directly and checks the HR
  workbench id inline.
- `hr-people-workbench.tsx` mixes container logic, HR projection rules, copy, UI
  blocks, and small reusable primitives in one file.
- HR CSS is isolated by class name but still lives as a large monolithic global
  stylesheet.
- HR projection rules are mostly covered through broad WorkerStudio integration
  tests instead of focused model tests.

## Decision

Introduce a minimal vertical Soul workbench module contract:

```text
WorkerStudio shell
  -> specialized workbench registry
  -> shared SoulWorkbenchContext
  -> souls/<soul>/<workbench>/
       index.tsx
       model.ts
       copy.ts
       components/
       styles.css
```

This is intentionally not a plugin framework. The registry is a compile-time map
inside Worker Web. The shared descriptor in `packages/shared` continues to define
metadata, actions, artifacts, views, and guardrails. The Web module owns actual
interaction and presentation.

## Scope

In scope:

- Add a shared `SoulWorkbenchContext` and renderer registry under
  `apps/web/src/worker/souls/`.
- Replace WorkerStudio's HR-specific import/id branch with the registry.
- Move HR People Workbench into `souls/hr/people-workbench/`.
- Split HR logic into:
  - container renderer;
  - pure model/projection helpers;
  - copy/local wording;
  - focused presentational components;
  - module-local styles.
- Extract small common section/status primitives under `souls/common/`.
- Add focused tests for HR profile projection, review state, lifecycle filtering,
  and recommended action ordering.

Out of scope:

- Runtime-loaded Soul plugins.
- Generic schema-to-UI rendering.
- New Soul-specific API/storage contracts.
- PM/QA/DevOps specialized workbenches.
- HR visual redesign beyond preserving the current layout during extraction.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright browser smoke for HR People Workbench and non-HR fallback.
- `bun run crg:update`
- `bun run crg:review`

## Risks

- **Over-abstracting after one Soul**: a plugin or schema renderer would slow
  current product delivery. Mitigation: keep the registry compile-time and only
  abstract the renderer context.
- **Moving files breaks CSS load order**: the HR stylesheet currently enters via
  global CSS. Mitigation: keep global import order but move the file under the
  HR module.
- **Behavior drift during extraction**: the goal is architecture, not product
  redesign. Mitigation: keep DOM semantics and existing WorkerStudio tests, then
  add focused model tests.
- **Next Soul still lacks a template**: directory shape alone is not enough.
  Mitigation: the registry/context/model/component split becomes the copyable
  starting point for the next specialized Soul.

## Progress

- 2026-05-12 16:38: Plan created and approved by the operator's architecture
  direction. Implementation started with the explicit boundary that this is a
  compile-time Web architecture, not a general plugin platform.
- 2026-05-12 17:34: Completed the architecture slice. The reusable contract is
  now `SoulWorkbenchContext` plus a small compile-time renderer registry.
  `WorkerStudio` no longer imports HR directly or branches on the HR workbench
  id. HR lives under `worker/souls/hr/people-workbench/` with separated
  container, components, model, copy, types, and module-local styles.
- 2026-05-12 17:34: Added focused HR model tests for lifecycle projection,
  needs-review semantics, attention filtering, lifecycle counts, and action
  ordering. Browser smoke confirmed HR desktop/mobile layout and non-HR PM
  fallback after the refactor.
