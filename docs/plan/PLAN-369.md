# PLAN-369 HR profile composer flow

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: FEAT-100

## Current State

The approved design is
`docs/superpowers/specs/2026-05-19-hr-profile-composer-flow-design.md`.

The current HR workbench right panel still exposes two overlapping choices:
`Next Profile Step` action cards and a separate proposal composer. When the
panel is collapsed, the implementation keeps an icon rail in the third column.
The composer has no file material input and the default WorkerStudio template
selection starts from `person-profile`, not the reviewable profile draft flow.

Focused baseline verification passed before implementation:

- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx src/worker/souls/hr/people-workbench/model.test.ts`
  passed with 46 tests.

## Proposal

Implement the approved HR profile composer flow inside the HR People Workbench.
Use existing shared primitives from `@zonease/aiworker-component` where they fit
the current design language, keep HR-specific wording and workflow behavior
inside `apps/web/src/worker/souls/hr`, and add a small workspace file-write API
helper so uploaded material files become workspace evidence references before a
session starts.

## Scope

- `apps/web/src/worker/souls/types.ts`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-rail.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/features/local-workspace/api/workspaces.ts`
- `apps/web/src/features/local-workspace/api/index.ts`
- `apps/web/src/features/i18n/catalog.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA docs and changelog

## Component Library Decision

Reuse package-owned primitives such as `IconButton`, `Textarea`, and existing
button styles. Do not extract the full composer to `packages/component` in this
slice: the behavior is tied to HR candidate materials, profile-draft defaults,
and HR proposal language. A future generic "material composer shell" can be
promoted only after another Soul App needs the same structure without HR
semantics.

## Implementation Plan

1. Add failing WorkerStudio tests for the final right-panel contract, no icon
   rail, default candidate profile draft selector, and multi-file material
   submission.
2. Add a workspace file-write API helper that uses the existing worker local
   file endpoint.
3. Extend the generic Soul workbench session submit contract with optional
   material inputs and material descriptors.
4. Update WorkerStudio submit logic to write uploaded materials under
   `evidence/uploads/`, include their paths in session context and metadata,
   and keep review/approval unchanged.
5. Replace the HR tools panel with Recent Sessions plus composer, remove rail
   rendering, and add compact multi-file rows.
6. Update HR copy and template display strings so `profile-update-proposal`
   reads as a candidate profile draft in the Web UI.
7. Update styles to match the approved right-panel layout, fixed-height
   attachment list, compact sessions, and no hidden rail column.
8. Run focused tests, typecheck, lint, build, browser smoke, app validate/smoke,
   diff check, and code-review-graph.

## Verification

- [x] RED: focused WorkerStudio tests failed for the old right-panel contract.
- [x] GREEN: focused WorkerStudio tests passed.
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' lint`
- [x] `bun run --filter '@zonease/aiworker-web' build`
- [x] `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- [x] `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- [x] `bun run web:smoke:mounted-surfaces`
- [x] Browser smoke against the local Web app.
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Annotations

- 2026-05-19: Started implementation from the approved Superpowers design,
  using isolated worktree `codex/hr-profile-composer-flow`.
- 2026-05-19: Completed the implementation. Browser smoke on a wide desktop
  verified the right panel is visible beside profile details, has no rail,
  places Recent Sessions above the composer, defaults to
  `aiworker-hr.profile-update-proposal`, and lets the composer consume the
  remaining panel height.
- 2026-05-19: `crg:review` exited 0 with advisory static test gaps for
  `writeFile`/`HrProfileToolsPanel`; the exercised behavior is covered through
  WorkerStudio integration tests and HR app smoke.
