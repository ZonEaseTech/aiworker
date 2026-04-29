# TODO-006 Normalize remote CLI PATH and version inspection

- **status**: completed
- **priority**: P3
- **owner**: Unassigned
- **createdAt**: 2026-04-28 20:24
- **discoveredAt**: 2026-04-28 20:24
- **releaseTarget**: `@zonease/aiworker-cli@0.4.5`
- **bkd**: 3k7sbl3h

## Description

Remote read-only reliability checks found the gateway service healthy and
versioned through the Bun global package path, but `aiworker`/`aim` were not
found on the default remote non-login shell PATH. The service `ExecStart` uses
the Bun-installed binary path, so operational health was unaffected.

## Acceptance Criteria

1. Decide the supported remote operator PATH expectation for systemd
   deployments.
2. Document a reliable version-inspection command for aissh/non-login shells.
3. Consider making `aiworker install systemd` or deployment docs install a
   stable symlink when appropriate.
4. Keep secret-bearing env files out of diagnostic output.

## ActiveForm

Normalizing remote CLI PATH and version inspection for systemd deployments

## Dependencies

- **blocked by**: none
- **blocks**: repeatable remote release validation
- **relates to**: BUG-014, REL-001, QA-001

## Notes

- 2026-04-28 20:24 Recorded from late `QA-001` reliability subtask. No source
  fix was made in the validation session.
- 2026-04-28 20:31 Dispatched to BKD issue `3k7sbl3h` and moved to `working`.
- 2026-04-28 20:52 Parent QA repeated a read-only remote health/version poll.
  The gateway service was `active`, local `/health` returned `ok=true`, and
  explicit `/root/.bun/bin/aiworker --version` reported `aiworker/0.4.4`; Bun
  global package listing reported `@zonease/aiworker-cli@0.4.4`. The
  non-interactive `command -v aiworker` path remained empty, reinforcing that
  remote diagnostics should inspect systemd `ExecStart` and/or use a stable
  explicit CLI path rather than trusting shell PATH.
