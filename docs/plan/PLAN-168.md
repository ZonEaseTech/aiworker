# PLAN-168 发布 aiworker CLI 0.10.3

- **status**: in_progress
- **createdAt**: 2026-05-08 02:08
- **approvedAt**: 2026-05-08 02:08
- **relatedTask**: REL-027

## 当前状态

1. npm latest 与本地 CLI package version 均为 `0.10.2`。
2. 最新 tag 为 `v0.10.2`，GitHub Release `v0.10.2` 已存在且含四个平台
   binary assets。
3. `v0.10.2..HEAD` 包含 Project Brain 布局收敛、worker 入网配置引导和
   README 用户定位/拓扑表达更新。

## 方案

发布 `@zonease/aiworker-cli@0.10.3` patch release。发布前运行本地 release
gate，发布后按 `aiworker-validate cli-release-local` 对已发布 package 做
compact governance harness 验证。

## 风险

1. GitHub release workflow 依赖 npm token 与 binary upload，可能在远端发布阶段失败。
2. 本次包含 CLI onboarding 与 Brain filesystem layout 相关变更，发布后必须验证
   published package，而不能只信 source tree。
3. Compact harness 覆盖面有限；若失败或暴露运行态风险，再升级 full matrix 或
   单独 BUG/QA。

## 范围

- `apps/cli/package.json`
- `README.md`
- `README.zh-CN.md`
- `docs/task/REL-027.md`
- `docs/plan/PLAN-168.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- release commit、tag、push、workflow verification、published package smoke、
  `cli-release-local` compact harness。

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
- `aiworker-validate cli-release-local` compact harness against `0.10.3`

## 进展

- 2026-05-08 02:08：调查和计划完成，开始 release bump 与本地 release gate。
- 2026-05-08 02:10：本地 release gate passed：frozen install、typecheck、
  lint、test、build、CLI run/fleet smoke、dist version checks、`git diff
  --check`、publish dry-run pack stage。
