# PLAN-062 发布 aiworker CLI 0.4.11

- **status**: approved
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

## Verification

待 release 流程完成后回填。
