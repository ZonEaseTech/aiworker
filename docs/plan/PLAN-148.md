# PLAN-148 发布 aiworker CLI 0.9.7

- **status**: implementing
- **createdAt**: 2026-05-07 01:17
- **approvedAt**: 2026-05-07 01:17
- **relatedTask**: REL-023

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.9.6`。
2. 本地与远端 `main` 已同步，HEAD 包含 `a511e1d`：
   `test: 增加 serve 重启连续性 harness`。
3. PLAN-147 / TODO-037 已在 source-local compact harness 中通过：
   72 PASS / 0 FAIL / 0 SKIPPED。
4. 远端不存在 `v0.9.7` tag。

## 方案

1. Bump `apps/cli/package.json` 从 `0.9.6` 到 `0.9.7`。
2. 同步 README latest、`REL-023` / `PLAN-148` / `docs/changelog.md`。
3. 跑本地 release gates：
   - `bun install --frozen-lockfile`
   - `bun run typecheck`
   - `bun run lint`
   - `bun run test`
   - `bun run build`
   - CLI run / fleet smoke
   - dist manifest version check
   - built CLI `--version` check
   - `git diff --check`
   - `bun publish --dry-run --access public` from `apps/cli/dist`
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.9.7`。
5. 打 `v0.9.7` annotated tag。
6. Push `main` 与 tag，监控 GitHub Actions release workflow。
7. 验证 npm latest、指定版本 `bunx`、GitHub Release assets。
8. 运行 `cli-release-local` compact Governance Kernel harness，确认发布包也
   覆盖 PLAN-147 的 serve restart continuity check。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在
   publish 阶段失败。
2. `cli-release-local` compact harness 会真实调用外部 executor；耗时和模型输出
   有波动，但目标是发布包行为验证，不以省 token 为目标。

## 范围

- 0.9.7 release metadata、README latest、CLI package version、dist artifact。
- 本地 release gates、tag、release workflow、npm/GitHub Release 验证。
- 发布后 `cli-release-local` compact harness 证据记录。

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不修 fleet/gateway backlog。
- 不新增 worker product behavior；本次发布已完成的 harness/source 变更。

## 验证

同 REL-023 的 Validation 列表。

## 进度

- 2026-05-07 01:17：PLAN-148 / REL-023 创建，开始 0.9.7 release gates。
