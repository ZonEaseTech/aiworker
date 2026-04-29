# TODO-002 Normalize CLI argument validation and command semantics

- **status**: completed
- **priority**: P2
- **owner**: Unassigned
- **createdAt**: 2026-04-28 20:24
- **discoveredAt**: 2026-04-28 20:24
- **releaseTarget**: `@zonease/aiworker-cli@0.4.4`
- **bkd**: qnmrzirf

## Description

Black-box CLI validation found inconsistent user-facing behavior for malformed
arguments and command semantics.

Observed behavior:

1. Missing args for `config-set`, `sessions show`, and `chat` exit `1` and
   print a `cac` stack trace.
2. `sessions list --status stale` exits `2` cleanly.
3. `chat --timeout-ms not-a-number` is not validated before attempting a
   gateway WebSocket connection.
4. `config-show` before `init` performs first-run setup in user scope, writes a
   `.env`, seeds config, prints the master-key warning, and exits `0`; this is
   surprising for a command that appears read-only.
5. `gateway status` returns exit `1` while a foreground gateway is healthy, and
   `gateway stop` exits `0` while leaving a foreground gateway running. The
   message mentions foreground/systemd, but the behavior is easy to misread.
6. `POST /health` returns `200` even though docs describe `GET /health`.

## Acceptance Criteria

1. Missing required args and unknown options do not print raw stack traces.
2. Invalid numeric options fail before network calls with a consistent exit
   code and actionable message.
3. Decide and document whether `config-show` is allowed to bootstrap state; if
   not, make it read-only before init.
4. Clarify or adjust foreground-vs-daemon behavior for `gateway status` and
   `gateway stop`.
5. Decide whether non-GET `/health` should be documented or rejected.
6. Add focused CLI tests for the normalized malformed-input paths.

## ActiveForm

Normalizing CLI malformed-input UX and command semantics

## Dependencies

- **blocked by**: none
- **blocks**: predictable operator UX
- **relates to**: BUG-031, QA-001

## Notes

- 2026-04-28 20:24 Recorded from late `QA-001` black-box subtask. No source fix
  was made in the validation session.
- 2026-04-28 20:31 Dispatched to BKD issue `qnmrzirf` and moved to `working`.
