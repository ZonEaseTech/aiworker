# PLAN-062 发布 aiworker CLI 0.4.11

- **status**: completed
- **createdAt**: 2026-05-01
- **approvedAt**: 2026-05-01
- **relatedTask**: REL-008

## Context

当前 release 状态：

1. npm `@zonease/aiworker-cli` latest 为 `0.4.10`。
2. 远端最高 release tag 为 `v0.4.10`，没有 `v0.4.11`。
3. `apps/cli/package.json` 在本计划前声明 `0.4.10`。
4. `main` 已包含自 0.4.10 之后合并的 FEAT-042 / FEAT-043 / FEAT-044、BUG-006 / BUG-038、REFACTOR-013 / REFACTOR-014 与 DOC-003 / DOC-004。
5. `HEAD == origin/main`，无未推送提交，工作区干净。
6. 现有 release workflow 在 tag `v*` 推送时从 `apps/cli/dist` 发布 npm 包并上传平台二进制。

## Proposal

1. Bump `apps/cli/package.json` 到 `0.4.11`（patch）。
2. 同步 `REL-008` / `PLAN-062` / `docs/changelog.md` / `docs/plan/index.md` / `docs/task/index.md`。
3. 跑本地 release gates：
   - `bun install --frozen-lockfile`；
   - `bun run --filter '*' test`；
   - `bun run typecheck`；
   - `bun run lint`；
   - `bun run build`；
   - `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`；
   - `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`；
   - `bun publish --dry-run --access public`（在 `apps/cli/dist` 内，至少完成 pack）。
4. 验证 dist 输出：`apps/cli/dist/package.json` 报告 `0.4.11`；`aiworker.js` shim 与 `aiworker-bun.js` 存在；Fleet 与 Worker Web bundle 存在。
5. 用 conventional commit 提交 release bump（`chore(release): 发布 CLI 0.4.11`）。
6. 打 `v0.4.11` tag，推送 `main` 与 tag，监控 GitHub Actions release workflow，验证 npm latest 与 published smoke。
7. 远端测试服 (`aissh aiwork`) 升级：`npm install -g @zonease/aiworker-cli@0.4.11 && systemctl restart aiworker-gateway`，并验证 `aiworker --version` 与 gateway `/health`。

## Risks

- 如 GitHub repository `NPM_TOKEN` 缺失/过期，release workflow publish 阶段会失败。回退是手工 `cd apps/cli/dist && bun publish --access public`。
- 测试服 systemd unit 的 `ExecStart` 当前仍指向 `/root/.bun/bin/aiworker`（per REFACTOR-004 followup）。`bun install -g @zonease/aiworker-cli@latest && systemctl restart aiworker-gateway` 是合规升级路径；若 unit 已迁到全局 npm 路径需先确认 binary 真正被 npm 覆盖。
- gateway 重启会有秒级中断；fleet.db 不动，已注册 worker reconnect 时自动恢复。

## Scope

预计仓库改动：

- `apps/cli/package.json`
- `docs/task/REL-008.md`
- `docs/task/index.md`
- `docs/plan/PLAN-062.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Alternatives

1. 升级到 `0.5.0`（minor）。不采用：本次没有 breaking change 或大跨度新机制，沿用 0.4.x patch 节奏更一致。
2. 跳过本次发版直接攒到下一组 feature。不采用：FEAT-042 / FEAT-044 / BUG-038 等改动均影响 worker 行为或观测，需要尽快推到测试服。

## Annotations

- 2026-05-01 用户直接要求"发版且在测试服更新最新版"，按 patch release + 测试服升级一并执行。
- 2026-05-01 19:27 本地 release gates 全过；publish dry-run 在 `apps/cli/dist` 内 packed 26 files / 2.43MB 后停在 npm authentication boundary（与 0.4.10 流程一致）。
- 2026-05-01 19:31 准备 commit 时发现 root `bun run lint` 在三处报错——其中 `aiworker.ts` / `operator/commands/common.ts` 是单纯的 perfectionist 排序漂移；`commands/serve.ts` 的 `openWorkerAdminBrowser is defined but never used` 是 3ac7168 merge resolve 时把 a1c94c6 引入的 admin URL/打开浏览器调用合掉、helper 留下的死代码。修复路径选择"恢复调用、清掉旧 `[aiw serve]` 前缀"，作为发版前置 fix 一同进入 0.4.11；CLI action 内 `opts.open` 也接回 `runServe`。
- 2026-05-01 19:31 push `main` + `v0.4.11`；GitHub Actions release run `25229619765` 全部成功（typecheck / test / bundle / npm publish / 单文件二进制 / GitHub Release）；workflow 仍带 Node.js 20 deprecation annotation（`softprops/action-gh-release@v2`），不影响发布。
- 2026-05-01 19:33 npm `@zonease/aiworker-cli` latest 解析为 `0.4.11`；`bunx --bun @zonease/aiworker-cli@0.4.11 --version` 报告 `aiworker/0.4.11`；GitHub Release `v0.4.11` 含 darwin-arm64 / darwin-x64 / linux-arm64 / linux-x64 四个 tarball。
- 2026-05-01 19:35 测试服 (`aissh aiwork`) `bun install -g @zonease/aiworker-cli@0.4.11` 完成；`systemctl restart aiworker-gateway` 后 unit active running，CGroup `ExecStart` 指向 `/root/.bun/install/global/node_modules/@zonease/aiworker-cli/aiworker-bun.js gateway start`；`/health` 返回 `{"ok":true,"service":"aiworker-gateway",...}`。

## Verification

- Passed: `bun install --frozen-lockfile`
- Passed: `bun run typecheck`
- Passed: `bun run lint`（修了 3 处后）
- Passed: `bun run --filter '*' test`
- Passed: `bun run build`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- Passed: `apps/cli/dist/package.json` 报告 `0.4.11`，`aiworker.js` shim 与 `aiworker-bun.js` 存在，Fleet/Worker Web bundle 均已就位
- Passed to local auth boundary: `cd apps/cli/dist && bun publish --dry-run --access public` packed 26 files / 2.43MB
- Passed: `git diff --check`
- Passed: GitHub Actions release workflow run `25229619765` for `v0.4.11`
- Passed: npm registry latest = `0.4.11`，published smoke `bunx --bun @zonease/aiworker-cli@0.4.11 --version` = `aiworker/0.4.11`
- Passed: GitHub Release `v0.4.11` 含 4 个平台 tarball
- Passed: 测试服 (`aissh aiwork`) `aiworker --version` = `aiworker/0.4.11`，`systemctl is-active aiworker-gateway` = active，`/health` ok
