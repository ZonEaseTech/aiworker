# PLAN-171 发布 aiworker CLI 0.10.4

- **status**: completed
- **createdAt**: 2026-05-08 22:13
- **approvedAt**: 2026-05-08 22:13
- **relatedTask**: REL-028

## 当前状态

1. npm latest 与本地 CLI package version 均为 `0.10.3`。
2. 最新 tag 为 `v0.10.3`，GitHub Release `v0.10.3` 已存在且含四个平台
   binary assets。
3. `v0.10.3..HEAD` 包含 native executor skill placement 与 managed native
   skill projection lifecycle。
4. 当前 `main` 已与 `origin/main` 同步，工作树干净。

## 方案

发布 `@zonease/aiworker-cli@0.10.4` patch release。发布前运行本地 release
gate，发布后按 `cli-release-local` 对已发布 package 做 compact governance
harness 验证。

## 风险

1. GitHub release workflow 依赖 npm token 与 binary upload，可能在远端发布阶段失败。
2. 本次触及 init/doctor/brain/admission/fs-layout 路径，发布后必须验证 published
   package，而不能只信 source tree。
3. Compact harness 覆盖面有限；若失败或暴露运行态风险，再升级 full matrix 或
   单独 BUG/QA。

## 范围

- `apps/cli/package.json`
- `README.md`
- `README.zh-CN.md`
- `docs/task/REL-028.md`
- `docs/plan/PLAN-171.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- `scripts/governance-kernel-harness.ts`
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
- `cli-release-local` compact harness against `0.10.4`

## 进展

- 2026-05-08 22:13：调查和计划完成，开始 release bump 与本地 release gate。
- 2026-05-08 22:16：本地 release gate 通过；dist package version 与
  built CLI 均为 `0.10.4`；publish dry-run 完成 pack stage 后在本机 npm auth
  boundary 停止，进入 release bump commit 与 tag 推送。
- 2026-05-08 22:19：release bump commit `fef85c6` 推送，annotated tag
  `v0.10.4` 推送；GitHub Actions release run `25560613180` 成功；npm latest、
  `bunx @zonease/aiworker-cli@0.10.4 --version` 与 GitHub Release assets 均验证通过。
- 2026-05-08 22:26：发布包 compact harness 首次失败，根因是 harness 仍断言
  `brain-skill-add` 应写 `.aiworker/skills/.../SKILL.md`；实际 0.10.4 已按最新
  设计写入 executor-native `.agents/skills/aiworker-*` / `.claude/skills/aiworker-*`
  并记录 projection manifest。
- 2026-05-08 22:56：harness 断言已改为 native skill projection + manifest；
  重跑 published-package compact harness 通过，80 PASS / 0 FAIL / 0 SKIPPED。
