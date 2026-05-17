# PLAN-348 HR Profile Revision Review Workbench

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **relatedTask**: FEAT-095

## Context

Current HR Web layout already supports:

- profile-first navigation in `HrPeopleWorkbench`;
- accepted profile rendering in `HrProfileReadingRoom`;
- artifact preview and profile approval in `HrProfileToolsPanel`;
- shared promotion validation through
  `prepareProfileMarkdownForPromotion(...)`.

The product gap is reviewer comprehension. The Web right panel should show the
reviewable profile revision, not just a raw artifact file.

## Proposal

1. Add a pure HR workbench revision-review model that consumes current profile
   Markdown and selected artifact Markdown.
2. Use the shared promotion helper to classify drafts as promotable or blocked.
3. Render a compact status strip, accepted draft preview, and current/proposed
   summary comparison in `HrProfileToolsPanel`.
4. Disable approval with clear copy when the artifact is not promotable.
5. Keep existing promotion API behavior: valid approval posts only the accepted
   profile Markdown.
6. Cover the behavior with model tests and Worker Web tests.

## Scope

- `apps/web/src/worker/souls/hr/people-workbench/revision-review.ts`
- `apps/web/src/worker/souls/hr/people-workbench/model.test.ts`
- `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `docs/task/FEAT-095.md`
- `docs/plan/PLAN-348.md`
- `docs/changelog.md`

## Risks

- Overfitting the UI into a hidden HR rules engine. Mitigation: use only shared
  profile promotion validation and existing README section parsing.
- Making the right panel too dense. Mitigation: keep the comparison compact and
  preserve the existing full artifact preview as secondary context.
- Regressing approval behavior. Mitigation: keep the existing API call path and
  extend the current Worker Web promotion test.

## Verification

- `bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
- Browser debug with mocked local API for ready approval, blocked approval, and
  mobile stacked comparison states.
