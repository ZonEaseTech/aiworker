# PLAN-391 SessionComposer shared UI consolidation

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **relatedTask**: BUG-148

## Current State

Investigation found that current app code no longer imports
`@zonease/aiworker-component`, but session composer code still exists in three
places:

- `packages/ui/src/components/session-composer.tsx` is the most complete
  shadcn-first implementation. It includes attachment rows, image thumbnails,
  dialog preview, paste ingestion helpers, and the correct panel flex behavior.
- `apps/web/src/features/session/session-composer.tsx` is a stale app-local
  copy. It differs from the UI package in panel flex behavior and a few action
  icon/select details.
- `packages/component/src/patterns/session-composer.tsx` is legacy. It still has
  older lucide/CSS composition and should not be preserved as the source of
  truth.

The HR profile composer already consumes `@zonease/aiworker-ui`, but its wrapper
maps image files to `mediaType: "image"` without `previewUrl`, so the shared
composer cannot render or open image previews for HR candidate materials.

## Proposal

Use `packages/ui/src/components/session-composer.tsx` as the only shared
SessionComposer implementation.

1. Add failing tests first:
   - HR profile composer creates image preview URLs and revokes them on removal
     and unmount.
   - Host Web session/workspace composer wrappers continue to show image preview
     affordances while importing the shared UI composer.
   - Shared UI composer covers the behavior currently protected only by the
     app-local copy tests.
2. Update the HR wrapper to store preview URLs on image attachments and pass
   preview labels/titles into the shared SessionComposer.
3. Update Host Web wrappers to import types/helpers/components directly from
   `@zonease/aiworker-ui/components/session-composer`.
4. Remove `apps/web/src/features/session/session-composer.tsx` and its duplicate
   tests after consumers and coverage move.
5. Leave `WorkerSessionChat`, timeline and view-model files untouched.

## Component Library Preflight

- Checked `packages/ui/src/components/session-composer.tsx`: this is the
  shadcn-managed source of truth and has the richest implementation.
- Checked `packages/ui` primitives used by the composer: `InputGroup`, `Button`,
  `Select`, `Dialog`, `Item`, `Badge`, `Alert`, and `Spinner`.
- App-local UI remains only for orchestration wrappers: HR owns profile proposal
  semantics; Host Web owns session submit, workspace submit and engine
  readiness wiring.
- Legacy `packages/component` usage is migration debt only. This plan does not
  add or modify legacy component behavior.

## Risks

- Chat regressions are high-cost because `WorkerSessionChat` has many tuned
  details. Mitigation: do not edit chat/timeline/view-model files; only import
  source changes in composer wrappers.
- HR preview object URLs can leak if not revoked. Mitigation: cover remove,
  submit-clear and unmount cleanup with tests.
- Moving imports to `packages/ui` can expose package export or type drift.
  Mitigation: focused Web/UI/HR typecheck and tests.

## Scope

- `packages/ui/src/components/session-composer.test.tsx`
- `apps/web/src/worker/session-turn-composer.tsx`
- `apps/web/src/features/local-workspace/components/session-composer.tsx`
- `apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx`
- HR/Web focused tests around composer behavior
- Duplicate app-local composer removal

## Non-Goals

- No `WorkerSessionChat` layout, scroll, drawer or header behavior changes.
- No session timeline, markdown preview or view-model consolidation.
- No broad `packages/component` deletion in this slice.
- No HR workbench column redesign.

## Verification Plan

- `bun run --filter '@zonease/aiworker-ui' test src/components/session-composer.test.tsx`
- `bun run --filter '@zonease/aiworker-web' test -- src/features/local-workspace/components/session-composer.test.tsx src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-hr' test -- product/web/component-proof.test.tsx product/web/people-workbench/api.test.ts`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun scripts/check-web-ui-components.ts --all --audit`
- `bun run crg:update`
- `bun run crg:review`

## Completion Notes

Implemented the conservative consolidation slice only:

- HR image attachments now receive preview URLs before being passed to the
  shared composer, restoring thumbnail/dialog preview behavior in the HR
  people workbench.
- Active Host Web composer wrappers now import `SessionComposer` from
  `@zonease/aiworker-ui`, so the stale app-local composer implementation could
  be removed.
- Shared UI composer tests now cover the behavior that had previously lived
  only in the app-local duplicate tests.
- UI governance classifications were updated for the current app-owned HR
  workbench surfaces and the new HR hidden file input wrapper.
- The chat surface remained frozen: no diff was introduced in
  `WorkerSessionChat`, `session-timeline`, `session-view-model`, or
  `message-flow`.

Verification completed for the focused HR/Web/UI test suites, package
typechecks, Web build, UI audit, UI audit test and code-review-graph review.
CRG reported no affected flows and an overall risk score of 0.50. The Web build
still emits the existing large-chunk warning.
