# PLAN-104 发布 aiworker CLI 0.6.0

- **status**: implementing
- **createdAt**: 2026-05-04 22:30
- **approvedAt**: 2026-05-04 22:30
- **relatedTask**: REL-013

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.5.3`。
2. GitHub Release latest 是 `v0.5.3`。
3. 本地与远端最新 release tag 是 `v0.5.3`。
4. 自 `v0.5.3` 至 `HEAD (191ba02)` 共 30 个 commit，包含：
   - `FEAT-048..054` 6 个 epic 收口（产品定位 pivot / executor BYO + overlay / Project Brain product surface / Worker-Fleet aggregation surface / BYO executor integration / Project scope = business scope / Soul modules + Scope Brain kernel）。
   - PLAN-097..103 完整落地 SoulModule registry、scope manifest、artifact registry、Soul schema pack、admission MVP、brief compiler、Worker REST + Worker Admin UI + Fleet UI 边界收口。
   - `BUG-052` / `BUG-053` Claude Code / Codex 流式文本去重。
   - 大量 docs/refactor。
5. 本次属 minor，不是 patch；按 semver 0.x 走 `0.6.0`。

## 方案

1. Bump `apps/cli/package.json` 到 `0.6.0`。
2. 同步 `REL-013` / `PLAN-104` / changelog 发版记录。
3. 跑本地 release gates：
   - root typecheck；
   - root lint；
   - workspace tests；
   - root build。
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.6.0`。
5. 打 `v0.6.0` annotated tag。
6. 暂停等待用户确认后再推送 `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在 publish 阶段失败。
2. 本轮包含跨 epic 的 brain / executor / scope 行为变更；published 后操作员升级时 first-run 路径与现有 `<project>/.aiworker/` 内容需要按新 scope manifest / artifact registry / admission 表结构兼容。
3. 跨 30 commit 的发版描述较长；changelog progress 段以 epic 维度概述，详细按已存在的 PLAN entries 留档。

## 范围

- `apps/cli/package.json`
- `docs/task/REL-013.md`
- `docs/task/index.md`
- `docs/plan/PLAN-104.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修改 release workflow。
- 不重建 fleet.db / worker.db。
- 不改 Caddy 或外部入口配置。
- 不做 published-package post-release smoke（留 release 后单独跟进）。

## 验证

- Passed: `bun run typecheck`（9 workspace 全 0 退出）
- Passed: `bun run lint`（无 violation）
- Passed: `bun run test`（fs-layout 20 / shared 120 / gateway-proto 19 / storage 19 / gateway 148 / core 554 / api 83 / web 59 / cli 159 = 1181 tests）
- Passed: `bun run build`（api index.js 1.43 MB / fleet bundle / worker bundle / cli aiworker-bun.js 1.0 MB；CSS utility check 通过；vite chunk-size warning 与既有产物一致）
- Passed: `apps/cli/dist/package.json` 报告 `@zonease/aiworker-cli 0.6.0`
- Passed: `git diff --check`

## 结果

- 发版 commit + `v0.6.0` tag 在本地就绪后，暂停等待用户确认，再推送触发 release workflow。
