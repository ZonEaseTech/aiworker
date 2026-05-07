# PLAN-162 发布 aiworker CLI 0.10.2

- **status**: completed
- **createdAt**: 2026-05-07 17:49
- **approvedAt**: 2026-05-07 17:49
- **completedAt**: 2026-05-07 23:28
- **relatedTask**: REL-026

## 当前状态

1. npm latest 与本地 CLI package version 均为 `0.10.1`。
2. 本地 `main` 比 `origin/main` ahead 2，包含两个 Worker Admin Web patch。
3. 这两个 patch 已有聚焦验证记录：
   - BUG-088：Worker Admin Chat duplicate final reply regression test、
     Web typecheck、lint、build 均通过。
   - BUG-089：Worker Admin Config build 通过。

## 方案

发布 `@zonease/aiworker-cli@0.10.2` patch release。版本变更只承载
BUG-088 / BUG-089 两个 Web UI 修复；发布验证按常规 release gate 执行，
发布后做 npm metadata、显式 `bunx` smoke 和 GitHub Release asset
verification。

## 风险

1. GitHub release workflow 依赖 npm token 与 binary upload，可能在远端发布阶段失败。
2. Web bundle 会重新生成资产 hash；需要通过 `bun run build` 与 package smoke 验证。
3. 本次不跑 full Governance Kernel matrix，因为变更不触碰 Brain / executor
   runtime；风险控制依赖 0.10.1 full matrix 基线与本次 release gate。

## 范围

- `apps/cli/package.json`
- `README.md`
- `docs/task/REL-026.md`
- `docs/plan/PLAN-162.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- release commit、tag、push、workflow verification、published package smoke。

## 验证

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- dist package version 与 built CLI `--version`
- `git diff --check`
- `cd apps/cli/dist && bun publish --dry-run --access public`
- GitHub Actions release workflow
- npm latest 与显式 package version smoke
- GitHub Release asset verification

## 进展

- 2026-05-07 17:49：调查和计划完成，开始 release bump 与本地 release gate。
- 2026-05-07 23:13：本地 release gate passed：frozen install、typecheck、
  lint、test、build、CLI run/fleet smoke、dist version checks、
  `git diff --check`、publish dry-run pack stage。
- 2026-05-07 23:27：release commit `268c87f`、`main`、annotated tag
  `v0.10.2` 已推送；GitHub Actions release run `25505262025` 成功发布 npm
  与四个平台 binary assets。
- 2026-05-07 23:28：npm latest、显式 `bunx` 版本 smoke、GitHub Release asset
  verification 全部通过。
