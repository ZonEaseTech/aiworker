# PLAN-132 发布 aiworker CLI 0.9.2

- **status**: pending
- **createdAt**: 2026-05-06 09:50
- **relatedTask**: REL-018

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.9.1`（自 `2026-05-06 04:24`
   发布）。
2. GitHub Release latest 是 `v0.9.1`，非 draft / 非 prerelease，4 个平台
   binary 已发布。
3. 本地与远端最新 release tag 是 `v0.9.1`；远端不存在 `v0.9.2` tag。
4. 自 `v0.9.1` 至 `HEAD (2d7d568)` 共 12 个 commit，全部为 `test:` /
   `docs:` / `docs(pma):` 前缀：

   - `5c9df22 test: 添加 Governance Kernel 回归验证 harness`
   - `abeb6a3 docs(pma): 记录 CLI 0.9.1 本地验证`
   - `4b709db docs(skills): 收敛 aiworker 验证入口`
   - `4998235 docs: 收口 REL-017 / PLAN-124 — CLI 0.9.1 已发版`
   - `552e07d test: PLAN-128 收口 Governance Kernel admission roundtrip 正向证据`
   - `de9ad05 docs(pma): QA-011 追加 cli-release-local 0.9.1 admission roundtrip 证据`
   - `6165311 test: PLAN-129 收口 admission 负向路径与 secret-scan-block 证据`
   - `04134ae docs(pma): QA-012 追加 cli-release-local 0.9.1 reject+secret-scan-block 证据`
   - `b8b3244 docs: 新增 Project Brain governance node 状态报告`
   - `13804b3 test: PLAN-130 收口 Governance Kernel full 5×2 matrix 证据`
   - `efac93a docs: 同步今日 governance kernel slices 到 changelog 并立 PLAN-131 全矩阵 cli-release-local`
   - `2d7d568 test: PLAN-131 收口 Soul-agnostic governance kernel 在已发布 CLI 0.9.1 的全矩阵证据`

5. 本次按 semver 0.x 走 `0.9.2` patch：0.9.1 之后没有产品代码变更，主要
   交付的是 Governance Kernel 回归 harness 与最终评估报告。Release 的语义
   是 "regression-coverage milestone"，不是产品行为升级。

## 方案

1. Bump `apps/cli/package.json` 从 `0.9.1` 到 `0.9.2`。
2. 同步 `REL-018` / `PLAN-132` / `changelog.md` 发版记录。
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
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.9.2`。
5. 打 `v0.9.2` annotated tag。
6. push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm
   与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在
   publish 阶段失败。
2. 因为 0.9.2 与 0.9.1 之间没有产品代码变更，rebuilt dist 与 0.9.1 在功能
   上等价；操作者应在发版说明中明确这是 "regression-coverage milestone"，
   避免被读成产品行为升级。
3. 自动化 release workflow 的 binary build 仍依赖 GitHub Actions runner 上
   的 Bun 环境；任何 runner 环境飘移都会让本次 release 在 binary 阶段
   失败。

## 范围

- `apps/cli/package.json`
- `docs/task/REL-018.md`
- `docs/task/index.md`
- `docs/plan/PLAN-132.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不修改 `scripts/governance-kernel-harness.ts` 行为；本次只是把它 ship
  为已 release 的资产。
- 不重跑 QA-013 / QA-014 full matrix；它们已是本次 release 的依据证据。

## 验证

同 REL-018 的 Validation 列表。

## 进度

- 2026-05-06 09:50：PLAN-132 / REL-018 创建，进入 implementing。npm latest
  仍是 `0.9.1`；远端 tag `v0.9.2` 不存在。
