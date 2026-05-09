# PLAN-189 Dogfood falsification and release readiness

- **status**: in_progress
- **owner**: local
- **createdAt**: 2026-05-09 05:55
- **approvedAt**: 2026-05-09 06:55
- **task**: FEAT-057

## Context

The goal is to prove the operating surface works in practice, not just that the
routes compile. Release readiness must include source, packaged CLI, and harness
evidence.

## Proposal

Run a dogfood campaign against aiworker itself:

1. create several real worker tasks;
2. inspect Case Files instead of raw Journal;
3. verify Review Decision can drive operator action within minutes;
4. propose/reject/apply lessons;
5. rerun at least one case;
6. publish a minor/patch release only after source and packaged validation pass.

## Scope

- QA task recording evidence.
- Release task if package changes justify publication.
- No 1.0 GA claim unless release criteria are fully met.

## Risks

- If Case File does not reduce review effort, the pivot is weak and should not
  expand to vertical workers.
- Published package validation can fail due executor environment, so source and
  packaged evidence must be distinguished.

## Verification

- `bun run check`
- `bun run test`
- `bun run build`
- `bun publish --dry-run --access public`
- published package smoke
- compact governance harness

## Progress

- 2026-05-09 11:57：source gate 已重跑通过：`bun run check`、`bun run test`、
  `bun run build`、`git diff --check`。
- 2026-05-09 11:57：dist bundle 与 publish manifest 均报告 `0.12.0`；
  `bun publish --dry-run --access public` 在 `apps/cli/dist` 完成 34 files /
  3.20MB pack stage，随后停在本机 npm auth boundary。
- 2026-05-09 11:57：source dogfood 使用
  `/tmp/aiworker-case-dogfood-39ezZQ/project` 初始化真实 project-scope worker，
  种入 worker-owned task / conversation / Brain Journal 后通过 bundle CLI 验证
  `case list`、`case show`、`lessons propose`。dogfood 发现 secret redactor 会误截
  `task-case` proposal id，已通过 commit `2a8d194` 修复并重跑验证。
