# FEAT-107 HR three-column interactive micro-app

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-20
- **claimedAt**: 2026-05-20
- **plan**: PLAN-390
- **spec**: docs/superpowers/specs/2026-05-20-hr-three-column-interactive-micro-app-design.md
- **implementationPlan**: docs/superpowers/plans/2026-05-20-hr-three-column-interactive-micro-app.md
- **relatesTo**: SOUL-001, PROTO-001, IMPORT-001, MOUNT-001, DATA-001, UI-001

## Background

BUG-147 correctly moved the HR people workbench back into the HR Soul App
package, but the current app-owned route is still closer to a static reading
surface than the mature three-column HR workbench that had already existed.
The missing product shape is Profile List, Reading Room, and Recent Sessions
plus Composer as the default desktop experience.

## Acceptance Criteria

1. The Host-mounted HR route defaults to three visible columns on desktop:
   Profile List, Reading Room, and Recent Sessions plus Composer.
2. Profile List always shows the lifecycle groups `候选人`, `在职员工`, and
   `离职归档`, expanded by default even when a group is empty.
3. The right column shows Recent Sessions above a working profile composer.
4. The composer defaults to `候选人档案草案` / `profile-update-proposal`.
5. Candidate material files can be attached, written under
   `evidence/uploads/`, and referenced in session context and metadata.
6. Profile patch review and approval stay in the center Reading Room path.
7. Host Web does not restore a Host-owned HR renderer under
   `apps/web/src/worker/souls/hr`.
8. Focused HR tests, mounted-surface smoke, UI audit, browser screenshots,
   diff check and code-review-graph run before completion.

## Completion Notes

- Restored the HR default route as an app-owned interactive three-column
  workbench: Profile List, Reading Room, and Recent Sessions plus Composer.
- Kept `候选人`, `在职员工`, and `离职归档` visible by default in the profile
  list, including empty lifecycle sections.
- Added the right-column composer with proposal type selection, multi-file
  material attachment, `evidence/uploads/` writes, and session creation through
  public local Host routes.
- Kept profile README review and approval inside the center Reading Room path
  and removed the Host Web HR-specific default template preference.

## Verification

- Passed: `bun run --filter '@zonease/aiworker-hr' test`
- Passed: `bun run --filter '@zonease/aiworker-hr' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-hr' build:client`
- Passed: `bun run --filter '@zonease/aiworker-hr' validate`
- Passed: `bun run --filter '@zonease/aiworker-hr' smoke`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun apps/web/scripts/smoke-mounted-surfaces.ts`
- Passed: Browser screenshot checks for desktop light, desktop dark and narrow
  mounted HR route.
- Passed: `git diff --check` for the HR/Web/PMA scope.
- Passed: `bun run crg:review` with no affected flow reported.
- Ran with known unrelated blocker: `bun run ui:check` still fails on existing
  `packages/component/src/catalog.ts` legacy migration debt, not on the new HR
  three-column surface.
