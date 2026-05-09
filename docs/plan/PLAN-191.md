# PLAN-191 Case-driven Brain loop 0.12.1 release readiness

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 15:08
- **approvedAt**: 2026-05-09 15:08
- **completedAt**: 2026-05-09 15:29
- **task**: REL-031

## Context

The repository is clean at commit `9e2d1ff`, which completed FEAT-058 source
validation. npm latest and the latest GitHub Release are still `0.12.0`, and
remote only has `v0.12.0` in the `0.12.x` line.

FEAT-058 fixes release-worthy correctness gaps in the `0.12.0` Case surface, so
the next shippable target is `0.12.1`.

## Proposal

1. Open release QA and release task records.
2. Bump CLI package version to `0.12.1`.
3. Run source release gates: check, test, build, diff check.
4. Verify bundle version and publish dry-run from `apps/cli/dist`.
5. Run real source dogfood for task-scoped Case evidence and truthful decisions.
6. Commit release docs/version bump and tag `v0.12.1`.
7. Push `main` and tag, monitor release workflow, verify npm/GitHub assets.
8. Run published-package compact governance harness and close REL/QA docs.

## Scope

- `apps/cli/package.json`
- generated `apps/cli/dist/*` only as build output, not source commit
- release QA / task / plan / changelog docs
- no UI redesign
- no PLAN-187 batch Lessons Queue review

## Risks

- Release workflow depends on GitHub secrets and npm publish permission.
- Published-package harness depends on local executor availability and may fail
  due environment issues rather than product regressions; QA must distinguish
  those cases.
- Real worker dogfood can expose a product blocker. If it does, stop release and
  open a BUG task instead of forcing the tag.

## Verification

- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun apps/cli/dist/aiworker-bun.js --version`
- `cd apps/cli/dist && bun publish --dry-run --access public`
- source dogfood for Case-driven Brain loop
- GitHub release workflow for `v0.12.1`
- `bunx @zonease/aiworker-cli@0.12.1 --version`
- `bun scripts/governance-kernel-harness.ts --mode cli-release-local --version 0.12.1 --matrix compact ...`

## Progress

- 2026-05-09 15:08：计划创建并进入 implementing。用户明确要求继续推进直至可发版投产，因此本计划视为已批准。
- 2026-05-09 15:52：修复 dogfood 暴露的 Case default redaction 误伤
  `authorityMode` 问题；补充 shared redaction regression test，focused tests
  passed。
- 2026-05-09 15:53：source gates passed：`bun run check`、`bun run test`、
  `bun run build`、`git diff --check`。
- 2026-05-09 15:53：dist reports `0.12.1`；publish dry-run pack stage passed
  with 34 files / 3.20MB, stopping only at expected local npm auth boundary。
- 2026-05-09 15:54：dist CLI source dogfood passed at
  `/private/tmp/aiworker-release-0.12.1-dogfood-BO6vss/project`，覆盖
  heuristic-only review、Brain-reviewed ready-to-ship、high-risk ambient
  authority review、task-scoped assistant selection、pending lesson proposal。
- 2026-05-09 15:21：pushed `main` and tag `v0.12.1`；release workflow
  `25595158313` passed and published npm + GitHub Release assets。
- 2026-05-09 15:22：`npm view @zonease/aiworker-cli version` returned
  `0.12.1`；`bunx @zonease/aiworker-cli@0.12.1 --version` returned
  `aiworker/0.12.1 darwin-arm64 node-v24.3.0`。
- 2026-05-09 15:23：main `lint` workflow `25595157442` and `build-image`
  workflow `25595157441` passed。
- 2026-05-09 15:29：published-package compact governance harness passed
  80/80 checks across `developer-codex` and `general-assistant-claude-code`。
