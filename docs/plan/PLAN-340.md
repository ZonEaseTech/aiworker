# PLAN-340 HR Profile Reading Room

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **relatedTask**: FEAT-093

## Current State

The HR app has a profile ledger and the Web workbench renders `README.md` as
`Current Profile Summary`, but the center column also renders profile sources,
proposed change preview and review guardrails as peer cards. The existing
workspace README seed lacks identity, role, capability and responsibility
sections, so it reads as an audit note rather than a people profile.

## Proposal

1. Update HR and fallback profile README seeds to a plain Markdown base-section
   contract.
2. Add an HR-local README section parser.
3. Replace the center mixed details card with a Reading Room renderer.
4. Move sources, proposed change, guardrails and sessions into a right tools
   rail/drawer that is collapsed by default.
5. Update focused runtime and Web tests.

## Risks

- The section parser could make README rendering fragile; fallback to full
  MarkdownPreview is required.
- Moving the proposed change preview could weaken the promotion flow; tests must
  prove the drawer path still promotes reviewed content.
- CSS changes could accidentally remove the existing independent scroll
  behavior; tests and browser smoke must check the layout.

## Scope

- `apps/aiworker-hr/engine-assets/workspace/README.md`
- `packages/core/src/worker/profile-ledger.ts`
- `packages/core/src/worker/runtime.test.ts`
- `apps/web/src/worker/souls/hr/people-workbench/**`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA/changelog docs

## Verification

- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts`
  passed with 11 tests.
- `bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
  passed with 36 tests.
- `bun run --filter '@zonease/aiworker-web' typecheck` passed.
- `bun run --filter '@zonease/aiworker-web' build` passed, including the
  worker studio CSS check.
- Browser smoke passed on `http://127.0.0.1:5273/workers/smoke-hr` with an
  isolated `AIWORKER_HOME`: the page rendered the profile list, center Reading
  Room, and collapsed right tools rail as three full-height columns.
- `bun run check` passed.
- `git diff --check` passed.
- `bun run crg:update` passed.
- `bun run crg:review` passed with overall risk score 0.45. The reported test
  gaps are residual graph heuristics for React helpers/components already
  covered by the focused HR integration test.
