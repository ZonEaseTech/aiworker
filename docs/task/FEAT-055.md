# FEAT-055 Worker-local dotenv enrollment env persistence

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 12:21
- **claimedAt**: 2026-05-06 12:21
- **completedAt**: 2026-05-06 12:28
- **plan**: PLAN-134
- **sourceObjective**: Persist `AIWORKER_GATEWAY_URL` / `AIWORKER_DISPLAY_NAME`
  and related worker enrollment env in `.aiworker/local/.env`, then align code
  and docs so multi-worker usage is unambiguous.
- **relatesTo**: PLAN-023, FEAT-024, FEAT-026, FEAT-030, FEAT-036

## Context

用户问题集中在两个边界：

1. `AIWORKER_GATEWAY_URL` / `AIWORKER_DISPLAY_NAME` 如果只是环境变量级别，
   多 worker 时会串配置；
2. `AIWORKER_HOME` 的意义如果只是“在哪里启动读哪里”，就不需要单独设计。

当前架构里的答案是：`AIWORKER_HOME` 是 worker runtime state root；project
scope 只是默认把这个 root 解析到 `<project>/.aiworker/local`。共享 Project
Brain 放 `<project>/.aiworker/`，私有 DB / secrets / startup env 放
`local/`。因此入网启动项应放 worker-local `.env`，不是 `config.yaml`。

## Scope

- `apps/cli/src/lib/dotenv-bootstrap.ts`
- focused tests under `apps/cli/src/lib/`
- `README.md`, `README.zh-CN.md`
- `docs/cli.md`, `docs/deployment.md`, `docs/architecture.md`
- PMA index files

## Acceptance Criteria

1. Existing `.env` with gateway/display/enroll keys is loaded before worker
   env parsing.
2. Explicit process env values for gateway/display/enroll keys are persisted
   back to the current scope's `.env` with chmod 0600.
3. Docs clearly direct project workers to `.aiworker/local/.env` and explain
   why `AIWORKER_HOME` is a state root instead of cwd alias.
4. Focused tests pass and no whitespace diff errors remain.

## Notes

- 2026-05-06 12:21: Started under PLAN-134.
- 2026-05-06 12:28: Completed. Focused dotenv unit tests, CLI package
  typecheck, CLI package test suite, lint, and `git diff --check` passed.
