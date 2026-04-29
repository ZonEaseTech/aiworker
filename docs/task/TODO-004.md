# TODO-004 Evaluate app-level admin auth or fail-closed checks

- **status**: in_progress
- **priority**: P2
- **owner**: self
- **createdAt**: 2026-04-28 20:24
- **discoveredAt**: 2026-04-28 20:24
- **releaseTarget**: `@zonease/aiworker-cli@0.4.4`
- **bkd**: `kz12xf5k`
- **proposal**: [PLAN-033](../plan/PLAN-033.md)

## Description

White-box review confirmed that `/admin/*` is intentionally public at the app
layer and depends on reverse-proxy auth or local-only binding for public
deployments. This is documented design, not a confirmed code bug, but it is a
high-risk operational dependency.

## Acceptance Criteria

1. Decide whether Fleet and Worker admin should support app-level auth in
   addition to reverse-proxy auth.
2. If app-level auth is not added, consider startup checks or warnings for
   public binds with admin serving enabled.
3. Ensure deployment docs clearly state how `/admin/*` is protected in public
   topologies.
4. Add tests or deployment smoke checks for the chosen fail-closed behavior.

## ActiveForm

Evaluating admin surface app-level auth and fail-closed deployment checks

## Dependencies

- **blocked by**: none
- **blocks**: public deployment hardening
- **relates to**: BUG-007, FEAT-033, QA-001

## Notes

- 2026-04-28 20:24 Recorded from late `QA-001` white-box subtask. No source fix
  was made in the validation session.
- 2026-04-28 20:31 Dispatched to BKD issue `kz12xf5k` in proposal mode and
  moved to `working`.
- 2026-04-28 20:33 Proposal ready for review in `PLAN-033`. Recommendation:
  adopt narrow startup fail-closed checks plus deployment smoke/docs, and defer
  a broad app-level admin auth model until there is a product requirement for
  first-party hosted public admin. Rationale: app-level `/admin/*` auth alone
  does not protect gateway `/ws`, while the highest-severity failure mode is
  still missing external auth on public ingress.
- 2026-04-28 20:37 Posted proposal summary to BKD coordinator `qprwd1j6` and
  moved BKD issue `kz12xf5k` to `review`.
- 2026-04-28 20:39 Retried per BKD follow-up. Reused the existing proposal docs
  rather than creating duplicates. Focused checks passed; proposal remains
  ready for review.
- 2026-04-28 20:44 Review pass recorded with no blocking findings. Proposal
  remains draft/pending approval; implementation must include the listed
  gateway/worker guard tests and public-admin smoke checks before completion.
