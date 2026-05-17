# PLAN-349 HR app production readiness campaign

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17 17:42
- **approvedAt**: 2026-05-17 17:42
- **completedAt**: 2026-05-17
- **relatedTask**: QA-037

## Context

The HR app now has native skill artifacts, a profile ledger, headless promotion,
and a Web review workbench. The remaining question is not whether each slice
works in isolation, but whether a fresh user can go from zero profile to
reviewed accepted profile through CLI and Web without product-boundary leaks.

The first production-readiness debug pass already passed the broad baseline
gates, but reproduced two concrete defects:

- `BUG-132`: promotion accepted review-ready proposal language inside the
  accepted README draft and wrote it into `README.md`.
- `BUG-133`: official Soul App `defaultTemplates` projection duplicated
  workspace defaults.

## Proposal

1. Keep the current disposable debug root as evidence, but treat its polluted
   README promotion as a blocker and validate the same dirty artifact is
   rejected after the fix.
2. Tighten shared accepted-profile promotion validation so proposal, review
   readiness, and awaiting-approval language cannot land in `README.md` from
   either CLI or Web.
3. Deduplicate projected official Soul App default templates while preserving
   declaration order.
4. Add focused shared/core/CLI/Web tests for the two defects and their product
   boundaries.
5. Run a second real disposable HR profile workflow from zero profile:
   generate a dirty proposal, prove it is blocked, then promote a clean
   reviewed draft.
6. Start a daemon with the disposable home and use browser automation against
   the served Web workbench to verify profile/proposed-change rendering and
   blocked/ready approval affordances.
7. Close PMA docs/changelog only after focused gates, real debug evidence,
   code-review-graph review, and commit.

## Scope

- HR app CLI/Web production readiness for profile artifact and README
  promotion.
- Shared projection and promotion helpers used by CLI/API/Web.
- PMA docs and changelog evidence.

## Non-Goals

- Redesigning Host/Soul App protocols beyond the reproduced projection bug.
- Changing external engine ownership or making Host interpret HR profile
  content.
- Reworking unrelated HR artifact types beyond what the validation campaign
  exercises.

## Risks

- Real Codex generations are nondeterministic. Mitigation: store raw artifacts
  under disposable debug roots and add deterministic regression tests for each
  defect.
- Promotion validation can become too broad. Mitigation: ban only phrases that
  describe proposal/review lifecycle state, while allowing accepted profile
  evidence gaps and HR next actions.
- Web verification can pass with mocked state but fail in daemon-served routing.
  Mitigation: use the dist daemon after source-level tests.

## Verification

- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- Real disposable CLI/Web debug evidence under `/private/tmp`.
- `bun run crg:review`

## Outcome

Completed the HR app production-readiness campaign across CLI and Web.

- `BUG-132` closed: shared profile promotion validation now rejects copied
  scaffold/proposal/review-ready language inside accepted README drafts; the
  original dirty artifact is blocked.
- `BUG-133` closed: official Soul App default templates are projected uniquely
  in declaration order across Host and standalone runtime paths.
- `BUG-134` closed: engine asset reprojection preserves existing workspace
  `README.md`, so accepted profile state is not overwritten by app scaffolds.
- Native HR profile proposal assets now show a clean accepted-profile fence
  example and explicitly keep lifecycle/review waiting state outside the
  promotable draft.
- Real debug evidence:
  `/private/tmp/aiworker-hr-prod-20260517173556` for dirty reproduction and
  rejection, and `/private/tmp/aiworker-hr-prod-fix-20260517-2gs7kH` for the
  fixed Grace Hopper CLI/Web path.
- Daemon-served Worker Web rendered the promoted Grace Hopper profile baseline
  and ready proposed-change review state through Playwright.
- Verification passed: focused tests, HR app validate/smoke/typecheck/test,
  CLI bundle build, dist release smoke, root `check`, and full repo `test`.
