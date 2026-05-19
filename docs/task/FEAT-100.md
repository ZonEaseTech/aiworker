# FEAT-100 HR profile composer flow

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-369
- **relatesTo**: ARCH-001, SOUL-001, PROTO-001, FEAT-093, FEAT-095, FEAT-096, FEAT-099

## Background

The approved design in
`docs/superpowers/specs/2026-05-19-hr-profile-composer-flow-design.md`
converges the HR right panel into a compact profile composer. After a profile
is created, the user should see recent work and one obvious next input surface:
add candidate material, choose the current proposal type, and generate a
reviewable candidate profile draft.

## Acceptance Criteria

1. HR right panel renders only compact Recent Sessions and the profile composer.
2. Recent Sessions appears at the top, uses session names, shows at most four
   visible rows, and scrolls overflow.
3. Hidden right panel removes the old icon rail completely.
4. Composer fills the remaining right-panel height with header, textarea,
   optional material rows, and bottom action bar.
5. Action bar exposes add-material, current proposal type, and submit controls
   without persistent "Add material", "Proposal", or full-access labels.
6. Default HR proposal type is the reviewable candidate profile draft flow.
7. Multiple uploaded material files render compact rows, can be removed, and
   submit with the session context and metadata.
8. Review and approval remain in the center profile patch review flow.
9. Focused Web tests, typecheck/lint/build, browser smoke, and
   code-review-graph pass or report only understood advisory gaps.

## Notes

- Host still only routes HR-owned surfaces. HR owns profile semantics and
  proposal language.
- This pass reuses existing `@zonease/aiworker-component` primitives. It does
  not promote the full HR composer into the shared package because candidate
  material wording, proposal defaults, and profile draft semantics are
  app-owned.

## Completion

Completed 2026-05-19.

- HR right panel now contains compact Recent Sessions plus one profile-draft
  composer. The old icon rail is removed when the panel is collapsed.
- The composer defaults to the reviewable `profile-update-proposal` flow,
  supports multiple material files, writes them under `evidence/uploads/`, and
  passes material descriptors through session metadata.
- Review/approval remains in the center profile patch review flow; generated
  output is still a reviewable proposal, not a direct README/profile mutation.
- Component library decision: reuse shared primitives (`IconButton`,
  `Textarea`, existing button styles) and keep the full composer in the HR app
  until another Soul App needs the same generic material-composer shell.

Verification:

- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx src/worker/souls/hr/people-workbench/model.test.ts`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun run web:smoke:mounted-surfaces`
- Browser smoke against local Web at `127.0.0.1:5179` with the HR app enabled:
  wide desktop confirmed no rail, Recent Sessions above composer, default
  `aiworker-hr.profile-update-proposal`, and composer consuming remaining
  panel height.
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review` exited 0; it reported static advisory test gaps for
  helpers/components that are covered by the WorkerStudio integration flow.
