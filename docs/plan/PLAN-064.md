# PLAN-064 发布 aiworker CLI 0.5.0

- **status**: completed
- **createdAt**: 2026-05-02 19:41
- **approvedAt**: 2026-05-02 19:41
- **completedAt**: 2026-05-02 19:51
- **relatedTask**: REL-009

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.4.11`。
2. 本地与远端最新 release tag 是 `v0.4.11`。
3. `main` 已包含 `REFACTOR-015` 的 CLI IA 收敛与 `FEAT-045` 的 `aiworker up` 快速启动。
4. `apps/cli/package.json` 在本计划前声明 `0.4.11`。
5. 现有 release workflow 在 tag `v*` 推送时从 `apps/cli/dist` 发布 npm 包，并上传平台二进制到 GitHub Release。

## 方案

1. Bump `apps/cli/package.json` 到 `0.5.0`。
2. 同步 `REL-009` / `PLAN-064` / changelog 发版记录。
3. 跑本地 release gates：
   - workspace tests；
   - root typecheck；
   - root lint；
   - root build；
   - CLI smoke scripts；
   - release diff check。
4. 验证 package output：
   - `apps/cli/dist/package.json` 报告 `0.5.0`；
   - npm shim 与 Bun bundle 均存在且可执行；
   - Web bundles 存在于 dist；
   - `bun publish --dry-run --access public` 至少完成 pack 阶段。
5. 用 conventional commit 提交 release bump。
6. 打 `v0.5.0` tag，推送 `main` 和 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。
7. 使用 `aissh` 升级测试服 gateway/fleet 到 `0.5.0`，验证 service、health 与 CLI version。

## 风险

1. 如果 GitHub repository 的 `NPM_TOKEN` 缺失或过期，release workflow 会在 publish 阶段失败。
2. 本次 release 包含 pre-1.0 CLI IA 破坏性收敛；版本使用 `0.5.0` 而不是 `0.4.12`，降低用户误判为普通 patch 的风险。
3. 测试服升级必须保留现有 env/config/fleet.db，只升级 npm CLI 并重启 gateway 服务。
4. `aissh` 输出可能包含服务器标识或敏感信息；发版记录只写摘要和占位，不记录原始凭据或私有 URL。

## 范围

- `apps/cli/package.json`
- publish artifact under `apps/cli/dist/`
- `docs/task/REL-009.md`
- `docs/task/index.md`
- `docs/plan/PLAN-064.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不新增 CLI 功能。
- 不修改 release workflow。
- 不迁移测试服数据，不重建 fleet.db，不改 Caddy 或外部入口配置。
- 不做额外 Codex-backed worker session E2E；本次测试服验证聚焦 gateway/fleet 升级与 published CLI smoke。

## 验证

- Passed: `bun install --frozen-lockfile`
- Passed: `bun run --filter '@zonease/aiworker-cli' test`
- Passed: `bun test packages/core/src/worker/runtime.test.ts packages/gateway/test/config.test.ts`
- Passed: `bun run test`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `bun run build`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- Passed: `apps/cli/dist/package.json` reports `0.5.0`
- Passed: npm shim and Bun bundle are present in `apps/cli/dist`
- Passed: Fleet and Worker Web bundles are present in `apps/cli/dist/web`
- Passed to local auth boundary: `cd apps/cli/dist && bun publish --dry-run --access public` packed 26 files / 2.45MB, then stopped with missing local npm authentication.
- Passed: `git diff --check`
- Passed: GitHub Actions release workflow `25251183256` for `v0.5.0`
- Passed: npm registry latest resolves to `0.5.0`
- Passed: GitHub Release `v0.5.0` has linux-x64, linux-arm64, darwin-x64, and darwin-arm64 tarballs
- Passed: published CLI smoke reports `aiworker/0.5.0`
- Passed: published CLI `aiworker up --help`
- Passed: published CLI `aiworker up --soul developer --dry-run --no-open --no-serve-web`
- Passed: 测试服 gateway/fleet health and installed CLI version report `0.5.0`
- Passed: 测试服 gateway `/admin/` serves Fleet Web index, CSS, and JS assets
- Passed: 测试服 `aiworker fleet list`

## 结果

- `@zonease/aiworker-cli@0.5.0` 已发布到 npm latest。
- `v0.5.0` GitHub Release 已创建并上传四个平台的 standalone tarball。
- 测试服 gateway/fleet 已升级到 `0.5.0`，服务和 admin bundle smoke 正常。
- 发现一个非阻断 follow-up：BUG-042 跟踪 `up --dry-run` 未传 `--port` 时显示 `NaN`。
