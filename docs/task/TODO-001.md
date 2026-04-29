# TODO-001 Correct Web UI command copy for enrollment and worker management

- **status**: completed
- **priority**: P2
- **owner**: Unassigned
- **createdAt**: 2026-04-28 20:24
- **discoveredAt**: 2026-04-28 20:24
- **releaseTarget**: `@zonease/aiworker-cli@0.4.5`
- **bkd**: 2i506owq

## Description

The UI smoke found stale or inaccurate CLI command copy in Fleet admin views.

Observed examples:

1. Enrollment empty-state copy says workers running `aiworker enroll otp` will
   appear, but the CLI exposes `aiworker enroll list|approve|reject`; OTP worker
   submission is triggered by `aiworker serve` with gateway enrollment env.
2. Fleet worker detail self-management copy references `aiworker worker start`,
   which is not a CLI command; the implemented local server command is
   `aiworker serve`.

## Acceptance Criteria

1. Audit Fleet and Worker admin copy for CLI command names and enrollment flow
   descriptions.
2. Replace stale command names with executable `aiworker` commands.
3. Add a lightweight text regression test for the known bad strings.
4. Keep user-facing text concise and avoid exposing secrets or token examples.

## ActiveForm

Correcting Web UI command copy for OTP enrollment and worker self-management

## Dependencies

- **blocked by**: none
- **blocks**: operator onboarding clarity
- **relates to**: FEAT-034, FEAT-035, QA-001

## Notes

- 2026-04-28 20:24 Recorded from late `QA-001` UI/UX subtask. No source fix was
  made in the validation session.
- 2026-04-28 20:31 Dispatched to BKD issue `2i506owq` and moved to `working`.
