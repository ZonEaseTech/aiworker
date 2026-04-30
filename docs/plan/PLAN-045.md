# PLAN-045 发布 aiworker CLI 0.4.7

- **status**: implementing
- **createdAt**: 2026-04-30 02:02
- **approvedAt**: 2026-04-30 02:02
- **relatedTask**: REL-004

## Context

当前 release 状态：

1. npm `@zonease/aiworker-cli` latest 是 `0.4.6`。
2. 本地最高 release tag 是 `v0.4.6`。
3. `apps/cli/package.json` 在本计划前声明 `0.4.6`。
4. `main` 已包含 `0.4.6` 之后的 CLI init preflight、Audit 表格滚动修复、
   code-review-graph 工作流接入和 gateway worker bridge MVP。
5. FEAT-040 / PLAN-042 仍保持 in-progress；本次 release 只发布已合入的 bridge
   MVP，不把完整 Fleet-hosted Worker UI 或 SSE bridge 计入完成范围。
6. 现有 release workflow 在 tag `v*` 推送时从 `apps/cli/dist` 发布 npm 包，并上传
   平台二进制到 GitHub Release。

## Proposal

1. Bump `apps/cli/package.json` 到 `0.4.7`。
2. 同步 `REL-004` / `PLAN-045` / changelog 发版记录。
3. 跑本地 release gates：
   - frozen install；
   - workspace tests；
   - root typecheck；
   - root lint；
   - root build；
   - CLI smoke scripts；
   - release diff check。
4. 验证 package output：
   - `apps/cli/dist/package.json` 报告 `0.4.7`；
   - Web bundles 存在于 dist；
   - `bun publish --dry-run --access public` 至少完成 pack 阶段。
5. 用 conventional commit 提交 release bump。
6. 打 `v0.4.7` tag，推送 `main` 和 tag，监控 GitHub Actions release workflow，然后验证
   npm 与 GitHub Release。

## Risks

- 如果 GitHub repository 的 `NPM_TOKEN` 缺失或过期，release workflow 会在 publish 阶段失败。
- 本地 `main` 已 ahead `origin/main`；推送 release 会同时推送当前 main 上尚未到远端的提交。
- Gateway worker bridge 只覆盖 info/config MVP。完整 FEAT-040 / PLAN-042 体验需要后续任务继续完成。
- 本计划不包含测试服升级；远端测试服如需升级，应另走 `npm install -g @zonease/aiworker-cli@0.4.7`
  与 `aiworker install systemd` 流程。

## Scope

Expected repository changes:

- `apps/cli/package.json`
- `docs/task/REL-004.md`
- `docs/task/index.md`
- `docs/plan/PLAN-045.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Alternatives

1. 本地从 `apps/cli/dist` 直接 publish。暂不采用，因为仓库已有 tag-triggered release workflow 和 npm credentials。
2. 等 FEAT-040 / PLAN-042 完整完成再发。暂不采用，因为用户明确要求先发布 0.4.7，并将完整任务另起处理。

## Annotations

- 2026-04-30 02:02 用户直接要求先发布 0.4.7，FEAT-040 / PLAN-042 后续另起任务处理。
- 2026-04-30 02:08 本地 release gates 全部通过，publish dry-run 完成 pack 阶段后停在本机 npm authentication boundary。

## Verification

- Passed: `bun install --frozen-lockfile`
- Passed: `bun run --filter '*' test`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `bun run build`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- Passed: `apps/cli/dist/package.json` reports `0.4.7`
- Passed to local auth boundary: `bun publish --dry-run --access public` from
  `apps/cli/dist` packed 25 files / 2.32MB, then stopped with missing local npm
  authentication.
