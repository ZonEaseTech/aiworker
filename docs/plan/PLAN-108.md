# PLAN-108 发布 aiworker CLI 0.7.0

- **status**: implementing
- **createdAt**: 2026-05-05 02:30
- **approvedAt**: 2026-05-05 02:30
- **relatedTask**: REL-014

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.6.0`。
2. GitHub Release latest 是 `v0.6.0`。
3. 本地与远端最新 release tag 是 `v0.6.0`。
4. 自 `v0.6.0` 至 `HEAD (3027f85)` 共 9 个 commit：
   - `b698814` PLAN-105 Project Brain 注入贯穿 4 个 executor adapter + decision retry（BUG-056 P0 / BUG-057 P1）。
   - `e5161ed` PLAN-106 Brain admission MVP 安全 / 鲁棒 / 可观察性补齐 — shared/core/api 段（BUG-055 P0 / BUG-058 P2 / BUG-059 P3 / TODO-009 / TODO-010）。
   - `110b18e` PLAN-107 strip undefined/blank artifactRefs in brief schema（BUG-054 P2）。
   - `eca8b95` PLAN-106/107 — CLI 段（admission propose + apply --allow-secret-body + brief artifact 兜底 + init next-steps polish；TODO-011 P3）。
   - `2e67e4c` docs：收口 PLAN-105/106/107 + QA-004 9 task + 0.6.0 缺陷 changelog。
   - `defd4a2` chore(tsconfig)：删除 workspace tsconfig baseUrl 兼容 TypeScript 7.0。
   - `3027f85` chore：update serena project。
   - `a1ae009` chore(cli)：npm description 对齐 Project Brain canonical tagline。
   - `80a6b74` docs：落盘 0.6.0 published claude-code 调试发现 + release-debug skill。
5. 上一轮 PLAN-105/106/107 closeout commit 已记 `typecheck` / `lint` / `test (1222 tests, +41 vs 0.6.0 baseline 1181)` 全绿，但未跑 `bun run build`。
6. 本次按 semver 0.x 走 `0.7.0` minor：BUG-056 让 SOUL/AGENT/MEMORY 真正注入 LLM、PLAN-106 新增 CLI surface（`brain admission propose`）+ REST endpoint（`POST /admission`）+ 新 flag（`--allow-secret-body`）+ schema 字段（`secretScan` / `skipped` / evidence summary/notes），用户可观察行为发生本质改变。

## 方案

1. Bump `apps/cli/package.json` 到 `0.7.0`。
2. 同步 `REL-014` / `PLAN-108` / changelog 发版记录。
3. 跑本地 release gates：
   - root typecheck；
   - root lint；
   - workspace tests；
   - root build；
   - `apps/cli/dist/package.json` 版本字段断言；
   - `git diff --check`。
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.7.0`。
5. 打 `v0.7.0` annotated tag。
6. 暂停等待用户确认后再推送 `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在 publish 阶段失败。
2. PLAN-105 修通后 brain 注入路径 = 用户可观察行为质变；published 后操作员升级时可能首次发现 SOUL/AGENT/MEMORY 现有内容里没注意到的提示词问题。
3. PLAN-106 admission `apply --commit` 默认 `secretScan.action=block`（HTTP 409 / CLI exit 1）；曾经粘贴 secret-like body 的工作流会被拦，需要显式 `--allow-secret-body`（decision row 会记录）。
4. `defd4a2` 删除 workspace tsconfig baseUrl 影响从源码构建的 consumer；npm 用户拿 pre-bundled `aiworker-bun.js`，不受影响。

## 范围

- `apps/cli/package.json`
- `docs/task/REL-014.md`
- `docs/task/index.md`
- `docs/plan/PLAN-108.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不重建 fleet.db / worker.db。
- 不改 Caddy 或外部入口配置。
- 不做 published-package post-release smoke（留 release 后单独跟进，与 REL-013 一致）。

## 验证

- Pending: `bun run typecheck`
- Pending: `bun run lint`
- Pending: `bun run test`
- Pending: `bun run build`
- Pending: `apps/cli/dist/package.json` 版本字段 = `0.7.0`
- Pending: `git diff --check`
- Pending: GitHub Actions release workflow 全绿
- Pending: `npm view @zonease/aiworker-cli version` → `0.7.0`
- Pending: `gh release view v0.7.0` → 4 个平台 binary uploaded

## 进度

- 2026-05-05 02:30: PLAN-108 / REL-014 创建，进入 implementing。
