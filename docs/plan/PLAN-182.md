# PLAN-182 发布 aiworker CLI 0.11.0

- **status**: completed
- **createdAt**: 2026-05-09 08:28
- **approvedAt**: 2026-05-09 08:28
- **relatedTask**: REL-029

## 当前状态

1. npm latest 与本地 CLI package version 均为 `0.10.4`。
2. 最新 release tag 为 `v0.10.4`，远端不存在 `v0.11.0`。
3. `v0.10.4..HEAD` 包含 FEAT-056 proof-loop runtime 与 readiness 收口。
4. 当前 `main` 领先 `origin/main` 7 个提交，工作树干净。

## 方案

发布 `@zonease/aiworker-cli@0.11.0` minor release。发布前运行本地 release gate，
发布后按 `cli-release-local` 对已发布 package 做 compact governance harness 验证。

## 风险

1. GitHub release workflow 依赖 npm token 与 binary upload，可能在远端发布阶段失败。
2. 0.11.0 包含 worker proof-loop 新 surface，必须验证 published package，不能只信
   source tree。
3. Compact harness 覆盖面有限；若失败或暴露运行态风险，再升级 full matrix 或单独
   BUG/QA。

## 范围

- `apps/cli/package.json`
- `README.md`
- `README.zh-CN.md`
- `docs/task/REL-029.md`
- `docs/plan/PLAN-182.md`
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
- `cli-release-local` compact harness against `0.11.0`

## 进展

- 2026-05-09 08:28：调查和计划完成，开始 release bump 与本地 release gate。
- 2026-05-09 08:31：本地 release gate 通过；dist package version 与 built CLI
  均为 `0.11.0`；publish dry-run 完成 pack stage 后在本机 npm auth boundary
  停止，进入 release bump commit 与 tag 推送。
- 2026-05-09 08:34：release bump commit `c67c66c` 与 annotated tag `v0.11.0`
  推送成功；GitHub Actions release run `25586331820` 成功；npm latest、
  `bunx @zonease/aiworker-cli@0.11.0 --version` 与 GitHub Release assets 均验证通过。
- 2026-05-09 08:36：main lint 的 Web bundle-size baseline failure 已用
  commit `61b9729` 收口；重跑后的 main lint `25586451966` 与 build-image
  `25586451942` 均成功。
- 2026-05-09 08:43：发布包 compact harness 通过，80 PASS / 0 FAIL / 0 SKIPPED。
