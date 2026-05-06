# PLAN-146 发布 aiworker CLI 0.9.6

- **status**: completed
- **createdAt**: 2026-05-07 00:49
- **approvedAt**: 2026-05-07 00:49
- **completedAt**: 2026-05-07 00:56
- **relatedTask**: REL-022

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.9.5`。
2. GitHub Release `v0.9.5` 非 draft / 非 prerelease，4 个平台 binary 已发布。
3. 本地与远端 `main` 已同步，HEAD 是 `5b8bd60`。
4. 0.9.5 之后已有 worker-only fix commit：
   - `TODO-036 / PLAN-144`：harness 增加 cross `chat-id` isolation DB check；
   - `BUG-086 / PLAN-145`：Claude Code default 不再 pin volatile model alias。
5. 远端不存在 `v0.9.6` tag。

## 方案

1. Bump `apps/cli/package.json` 从 `0.9.5` 到 `0.9.6`。
2. 同步 README latest、`REL-022` / `PLAN-146` / `docs/changelog.md`。
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
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.9.6`。
5. 打 `v0.9.6` annotated tag。
6. Push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm
   与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在
   publish 阶段失败。
2. 本次只发布 source-conforming worker fixes；尚未加入下一步 serve process
   restart continuity harness。

## 范围

- 0.9.6 release metadata、README latest、CLI package version、dist artifact。
- 本地 release gates、tag、release workflow、npm/GitHub Release 验证。

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不修 fleet/gateway backlog。
- 不实现新的 serve restart harness；该项进入下一 PMA slice。

## 验证

同 REL-022 的 Validation 列表。

## 进度

- 2026-05-07 00:49：PLAN-146 / REL-022 创建，开始 0.9.6 release gates。
- 2026-05-07 00:56：`chore(release): 发布 CLI 0.9.6` 已推送到 `main`，
  annotated tag `v0.9.6` 已推送；release workflow `25449077642` 成功；
  `npm view @zonease/aiworker-cli version` 返回 `0.9.6`；指定版本 `bunx`
  返回 `aiworker/0.9.6 ...`；GitHub Release `v0.9.6` 已上传 4 个平台
  binary。
