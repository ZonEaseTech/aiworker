# PLAN-072 发布 aiworker CLI 0.5.2

- **status**: implementing
- **createdAt**: 2026-05-03 11:19
- **approvedAt**: 2026-05-03 11:19
- **relatedTask**: REL-011

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.5.1`。
2. 本地与远端最新 release tag 是 `v0.5.1`。
3. `0.5.1` 的 release workflow 成功，但 published CLI smoke 仍打印 `port         : NaN`。
4. 根因是 CLI action 层接收 CAC omitted numeric option `[NaN]` 后直接传给 `runUp()`。
5. 当前 main 已增加 command-layer optional numeric normalization，并补了 CLI-entrypoint integration test。

## 方案

1. Bump `apps/cli/package.json` 到 `0.5.2`。
2. 同步 `REL-011` / `PLAN-072` / changelog 发版记录。
3. 重新跑本地 release gates：
   - workspace tests；
   - root typecheck；
   - root lint；
   - root build；
   - CLI smoke scripts；
   - published-style local CLI entrypoint smoke；
   - release diff check。
4. 验证 package output：
   - `apps/cli/dist/package.json` 报告 `0.5.2`；
   - npm shim 与 Bun bundle 均存在且可执行；
   - Web bundles 存在于 dist；
   - `bun publish --dry-run --access public` 至少完成 pack 阶段。
5. 用 conventional commit 提交 release bump。
6. 打 `v0.5.2` tag，推送 `main` 和 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。
7. 用 published `0.5.2` 重新 smoke `aiworker up --soul developer --dry-run --no-open --no-serve-web`，确认不再出现 `NaN`。

## 风险

1. 如果 GitHub repository 的 `NPM_TOKEN` 缺失或过期，release workflow 会在 publish 阶段失败。
2. 本地 `main` 已 ahead `origin/main`；推送 release 会同时推送 `0.5.2` 修复提交。
3. `0.5.1` 已发布，npm 用户可能短暂拿到该版本；本次必须验证 npm latest 更新到 `0.5.2`。
4. `TODO-007` 仍不纳入本次 patch。

## 范围

- `apps/cli/package.json`
- publish artifact under `apps/cli/dist/`
- `docs/task/REL-011.md`
- `docs/task/index.md`
- `docs/plan/PLAN-072.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不处理 `TODO-007` Worker Admin polish。
- 不新增 CLI/API 功能。
- 不修改 release workflow。
- 不迁移测试服数据，不重建 fleet.db，不改 Caddy 或外部入口配置。

## 验证

- Passed: `bun run test`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `bun run build` (existing Vite chunk-size warnings only)
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- Passed: built CLI `apps/cli/dist/aiworker.js up --soul developer --dry-run --no-open --no-serve-web`
  prints `port         : (env/default)` and no `NaN`
- Passed: `apps/cli/dist/package.json` reports `@zonease/aiworker-cli 0.5.2`
- Passed: npm shim and Bun bundle are present in `apps/cli/dist`
- Passed: Fleet and Worker Web bundles are present in `apps/cli/dist/web`
- Passed to pack/auth boundary: `cd apps/cli/dist && bun publish --dry-run --access public`
- Passed: `git diff --check`

## 结果

- Local release gates passed. Pending `v0.5.2` tag push, GitHub Actions release,
  npm verification, GitHub Release asset verification, and published-package smoke.
