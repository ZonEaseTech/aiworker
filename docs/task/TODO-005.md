# TODO-005 Apply safe-env policy to git workspace helper processes

- **status**: completed
- **priority**: P3
- **owner**: Unassigned
- **createdAt**: 2026-04-28 20:24
- **discoveredAt**: 2026-04-28 20:24
- **releaseTarget**: `@zonease/aiworker-cli@0.4.4`
- **bkd**: jfmsr8wc

## Description

White-box review confirmed that agentic CLI child processes use the safe-env
path and focused tests passed. It also found that a non-agentic git workspace
helper passes the full parent `process.env` to `git`. Git hooks or config
helpers may inherit AIWorker secrets during workspace setup.

## Acceptance Criteria

1. Review `packages/core/src/worker/executor/workspace.ts` git spawn env usage.
2. Decide whether git helper processes should use the same safe-env policy,
   a narrower env, or an explicitly documented exception.
3. Add a regression test that sensitive AIWorker env vars are not exposed to
   child processes unless intentionally allowed.
4. Preserve required git behavior such as author config, PATH lookup, and SSH
   credential discovery.

## ActiveForm

Reviewing safe-env policy for git workspace helper processes

## Dependencies

- **blocked by**: none
- **blocks**: defense-in-depth for executor workspace setup
- **relates to**: BUG-018, QA-001

## Notes

- 2026-04-28 20:24 Recorded from late `QA-001` white-box subtask. No source fix
  was made in the validation session.
- 2026-04-28 20:31 Dispatched to BKD issue `jfmsr8wc` and moved to `working`.
