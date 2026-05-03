# PLAN-079 发布 aiworker CLI 0.5.3

- **status**: implementing
- **createdAt**: 2026-05-03 21:33
- **approvedAt**: 2026-05-03 21:33
- **relatedTask**: REL-012

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.5.2`。
2. GitHub Release latest 是 `v0.5.2`。
3. 本地与远端最新 release tag 是 `v0.5.2`。
4. 当前 main 已包含 worker local brain activation、executor bootstrap lifecycle，以及 `BUG-049` user/explicit init next-step polish。
5. `BUG-049` 修复已单独提交为 `b22c5d6 fix(cli): 修正 user-scope init 发版引导`。

## 方案

1. Bump `apps/cli/package.json` 到 `0.5.3`。
2. 同步 `REL-012` / `PLAN-079` / changelog 发版记录。
3. 跑本地 release gates：
   - workspace tests；
   - root typecheck；
   - root lint；
   - root build；
   - CLI smoke scripts；
   - published-style local CLI entrypoint smoke；
   - release diff check。
4. 验证 package output：
   - `apps/cli/dist/package.json` 报告 `0.5.3`；
   - npm shim 与 Bun bundle 均存在；
   - Web bundles 存在于 dist；
   - `bun publish --dry-run --access public` 至少完成 pack 阶段。
5. 用 conventional commit 提交 release bump。
6. 打 `v0.5.3` tag，推送 `main` 和 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。
7. 用 published `0.5.3` smoke `aiworker --version`、`init --global` next steps 和 project `up --dry-run`。

## 风险

1. 如果 GitHub repository 的 `NPM_TOKEN` 缺失或过期，release workflow 会在 publish 阶段失败。
2. 本地 `main` 已 ahead `origin/main`；推送 release 会同时推送当前 main 上尚未到远端的 brain/executor bootstrap commits。
3. 本次包含用户可见的 brain/executor bootstrap 新能力，post-publish smoke 需要覆盖 first-run path。
4. `TODO-007` 仍不纳入本次 release blocker。

## 范围

- `apps/cli/package.json`
- publish artifact under `apps/cli/dist/`
- `docs/task/REL-012.md`
- `docs/task/index.md`
- `docs/plan/PLAN-079.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不处理 `TODO-007` Worker Admin polish。
- 不修改 release workflow。
- 不迁移测试服数据，不重建 fleet.db，不改 Caddy 或外部入口配置。

## 验证

- Passed: `bun run test`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `bun run build` (existing Vite chunk-size warnings only)
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- Passed: `apps/cli/dist/package.json` reports `@zonease/aiworker-cli 0.5.3`
- Passed: npm shim and Bun bundle are present in `apps/cli/dist`
- Passed: Fleet and Worker Web bundles are present in `apps/cli/dist/web`
- Passed: built CLI `apps/cli/dist/aiworker.js --version` reports `aiworker/0.5.3`
- Passed: built CLI `init --global` next steps do not include `aiworker executor doctor`
- Passed: built CLI `up --soul developer --dry-run --no-open --no-serve-web`
  reports capability `PASS`, executor readiness `WARN (non-blocking)`, omitted port `(env/default)`, and no `NaN`
- Passed to pack/auth boundary: `cd apps/cli/dist && bun publish --dry-run --access public`
- Passed: `git diff --check`

## 结果

- Local release gates passed. Pending `v0.5.3` tag push, GitHub Actions release,
  npm verification, GitHub Release asset verification, and published-package smoke.
