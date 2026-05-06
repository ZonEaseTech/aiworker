# PLAN-124 发布 aiworker CLI 0.9.1

- **status**: implementing
- **createdAt**: 2026-05-06 04:16
- **approvedAt**: 2026-05-06 04:16
- **relatedTask**: REL-017

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.9.0`。
2. GitHub Release latest 是 `v0.9.0`，非 draft / 非 prerelease，4 个平台 binary 已发布。
3. 本地与远端最新 release tag 是 `v0.9.0`；远端不存在 `v0.9.1` tag。
4. 自 `v0.9.0` 至 `HEAD (dd16d9e)` 共 2 个 commit：
   - `08cbaa7` docs：收口 `REL-016` / `PLAN-121`，记录 CLI 0.9.0 发布结果。
   - `dd16d9e` fix：收口 Brain Governance 后续缺陷，覆盖 `BUG-075..078` 和 `TODO-028..029`。
5. 本次按 semver 0.x 走 `0.9.1` patch：主变更是 QA-007 后续缺陷修复、worker.db observability migration、OpenAPI 文档修正和回归测试补齐，不引入新的产品级能力或 intentional breaking surface。

## 方案

1. Bump `apps/cli/package.json` 到 `0.9.1`。
2. 同步 `REL-017` / `PLAN-124` / changelog 发版记录。
3. 跑本地 release gates：
   - `bun install --frozen-lockfile`；
   - root typecheck；
   - root lint；
   - workspace tests；
   - root build；
   - CLI run / fleet smoke；
   - dist manifest version check；
   - built CLI `--version` check；
   - `git diff --check`；
   - publish dry-run pack 阶段。
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.9.1`。
5. 打 `v0.9.1` annotated tag。
6. push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在 publish 阶段失败。
2. 本次包含 worker.db migration `0007_solid_bromley.sql`；旧 worker 需要正常跑 worker migrations 后才能持久化 decision pipeline samples，运行时仍保留 best-effort fallback。
3. Claude Code no-tools control-call 投影是 best-effort；AIWorker 仍不是 executor sandbox。
4. 本地 `bun publish --dry-run` 预计会停在本机 npm authentication boundary；正式 publish 继续依赖 tag-triggered GitHub Actions workflow。

## 范围

- `apps/cli/package.json`
- `docs/task/REL-017.md`
- `docs/task/index.md`
- `docs/plan/PLAN-124.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不重跑 QA-007 full matrix；该验证已作为 0.9.0 后续缺陷来源和 PLAN-123 修复依据。
- 不升级测试服或外部部署。

## 验证

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- `apps/cli/dist/package.json` 版本字段 = `0.9.1`
- `bun apps/cli/dist/aiworker-bun.js --version` → `aiworker/0.9.1 ...`
- `git diff --check`
- publish dry-run pack 阶段
- GitHub Actions release workflow 全绿
- `npm view @zonease/aiworker-cli version` → `0.9.1`
- `bunx @zonease/aiworker-cli@0.9.1 --version` → `aiworker/0.9.1 ...`
- `gh release view v0.9.1` → 4 个平台 binary uploaded

## 进度

- 2026-05-06 04:16：PLAN-124 / REL-017 创建，进入 implementing。npm latest 确认为 `0.9.0`；GitHub Release `v0.9.0` 正常；远端不存在 `v0.9.1` tag。本次按 `0.9.1` patch release 执行。
- 2026-05-06 04:25：本地 release gates 全通过：`bun install --frozen-lockfile`、`bun run typecheck`、`bun run lint`、`bun run test`、`bun run build`、CLI run / fleet smoke、dist manifest version check、built CLI `--version`、`git diff --check`。`bun publish --dry-run --access public` 在 `apps/cli/dist` 完成 pack 阶段（32 files / 2.73 MB），随后停在本机 npm authentication boundary；正式发布仍走 tag-triggered GitHub Actions workflow 的 `NPM_TOKEN`。
