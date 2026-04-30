# PLAN-046 发布 aiworker CLI 0.4.8

- **status**: in-progress
- **createdAt**: 2026-04-30 08:32
- **approvedAt**: 2026-04-30 08:32
- **relatedTask**: REL-005

## Context

当前 release 状态：

1. npm `@zonease/aiworker-cli` latest 是 `0.4.7`。
2. 本地最高 release tag 是 `v0.4.7`，远端不存在 `v0.4.8` tag。
3. `apps/cli/package.json` 在本计划前声明 `0.4.7`。
4. `main` 已包含 `0.4.7` 之后的 Fleet 同源托管 Worker UI 完整交付。
5. 现有 release workflow 在 tag `v*` 推送时从 `apps/cli/dist` 发布 npm 包，并上传
   平台二进制到 GitHub Release。

## Proposal

1. Bump `apps/cli/package.json` 到 `0.4.8`。
2. 同步 `REL-005` / `PLAN-046` / changelog 发版记录。
3. 跑本地 release gates：
   - frozen install；
   - workspace tests；
   - root typecheck；
   - root lint；
   - root build；
   - CLI smoke scripts；
   - release diff check。
4. 验证 package output：
   - `apps/cli/dist/package.json` 报告 `0.4.8`；
   - Web bundles 存在于 dist；
   - `bun publish --dry-run --access public` 至少完成 pack 阶段。
5. 用 conventional commit 提交 release bump。
6. 打 `v0.4.8` tag，推送 `main` 和 tag，监控 GitHub Actions release workflow，然后验证
   npm 与 GitHub Release。

## Risks

- 如果 GitHub repository 的 `NPM_TOKEN` 缺失或过期，release workflow 会在 publish 阶段失败。
- 本地 `main` 已 ahead `origin/main`；推送 release 会同时推送当前 main 上尚未到远端的提交。
- 本计划不包含测试服升级；远端测试服如需升级，应另走 `npm install -g @zonease/aiworker-cli@0.4.8`
  与 `aiworker install systemd` 流程。

## Scope

Expected repository changes:

- `apps/cli/package.json`
- `docs/task/REL-005.md`
- `docs/task/index.md`
- `docs/plan/PLAN-046.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Alternatives

1. 本地从 `apps/cli/dist` 直接 publish。暂不采用，因为仓库已有 tag-triggered release workflow 和 npm credentials。
2. 继续使用 `0.4.7`。不采用，因为 npm 已存在 `0.4.7`，而 main 已包含后续 Fleet-hosted Worker UI 完整交付。

## Annotations

- 2026-04-30 08:32 用户直接要求发版，按 patch release 执行。
- 2026-04-30 08:34 本地 release gates 全部通过，publish dry-run 完成 pack 阶段后停在本机 npm authentication boundary。

## Verification

- Passed: `bun install --frozen-lockfile`
- Passed: `bun run --filter '*' test`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `bun run build`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- Passed: `apps/cli/dist/package.json` reports `0.4.8`
- Passed: Fleet and Worker Web bundles are present in `apps/cli/dist/web`
- Passed to local auth boundary: `bun publish --dry-run --access public` from
  `apps/cli/dist` packed 25 files / 2.34MB, then stopped with missing local npm
  authentication.
- Passed: `git diff --check`
