# PLAN-071 发布 aiworker CLI 0.5.1

- **status**: implementing
- **createdAt**: 2026-05-03 10:59
- **approvedAt**: 2026-05-03 10:59
- **relatedTask**: REL-010

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.5.0`。
2. 本地与远端最新 release tag 是 `v0.5.0`。
3. 本地 `main` 已包含 `0.5.0` 后的 Worker Admin、orchestrator、executor probe、init legacy home 和 `aiworker up --dry-run` 修复。
4. `apps/cli/package.json` 当前声明 `0.5.0`。
5. 现有 release workflow 在 tag `v*` 推送时从 `apps/cli/dist` 发布 npm 包，并上传平台二进制到 GitHub Release。
6. `TODO-007` 仍为 P3 polish，非本次 release blocker。

## 方案

1. Bump `apps/cli/package.json` 到 `0.5.1`。
2. 同步 `REL-010` / `PLAN-071` / changelog 发版记录。
3. 跑本地 release gates：
   - workspace tests；
   - root typecheck；
   - root lint；
   - root build；
   - CLI smoke scripts；
   - release diff check。
4. 验证 package output：
   - `apps/cli/dist/package.json` 报告 `0.5.1`；
   - npm shim 与 Bun bundle 均存在且可执行；
   - Web bundles 存在于 dist；
   - `bun publish --dry-run --access public` 至少完成 pack 阶段。
5. 用 conventional commit 提交 release bump。
6. 打 `v0.5.1` tag，推送 `main` 和 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。
7. 如测试服凭据和部署工具可用，升级测试服 gateway/fleet 到 `0.5.1`，验证 service、health 与 CLI version。

## 风险

1. 如果 GitHub repository 的 `NPM_TOKEN` 缺失或过期，release workflow 会在 publish 阶段失败。
2. 本地 `main` 已 ahead `origin/main`；推送 release 会同时推送当前 main 上尚未到远端的提交。
3. 测试服升级必须保留现有 env/config/fleet.db，只升级 npm CLI 并重启 gateway 服务。
4. `TODO-007` 未处理意味着 no-op config save、empty brain test 和 Cron metadata polish 仍会留到后续版本。

## 范围

- `apps/cli/package.json`
- publish artifact under `apps/cli/dist/`
- `docs/task/REL-010.md`
- `docs/task/index.md`
- `docs/plan/PLAN-071.md`
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
- Passed: `bun run build`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- Passed: `apps/cli/dist/package.json` reports `0.5.1`
- Passed: npm shim and Bun bundle are present in `apps/cli/dist`
- Passed: Fleet and Worker Web bundles are present in `apps/cli/dist/web`
- Passed to local auth boundary: `cd apps/cli/dist && bun publish --dry-run --access public` packed 26 files / 2.46MB, then stopped with missing local npm authentication.
- Passed: `git diff --check`

## 结果

- Local release gates passed. Pending release bump commit, `v0.5.1` tag, GitHub Actions release workflow, npm verification, and optional test fleet upgrade.
