# PLAN-160 发布 aiworker CLI 0.10.1

- **status**: in_progress
- **createdAt**: 2026-05-07 15:26
- **approvedAt**: 2026-05-07 15:26
- **relatedTask**: REL-025

## 当前状态

1. `@zonease/aiworker-cli@0.10.0` 已发布，compact 发布包验证通过。
2. QA-020 source-local full matrix 首轮发现 Codex executor timeout hard cap
   与 harness per-turn budget 不一致。
3. BUG-087 已让 `executor select --timeout-ms` 持久化
   `executor.overrides.timeoutMs`，并让 Governance Kernel harness 在每个
   pair 选择 executor 时同步该预算。
4. BUG-087 后 source-local full matrix 通过：400 PASS / 0 FAIL / 0 SKIPPED。
5. npm latest 仍为 `0.10.0`，发布包还没有包含该修复。

## 方案

发布 `@zonease/aiworker-cli@0.10.1` patch release，只承载 BUG-087 的 timeout
预算修复与对应文档状态更新。发布后不止跑 compact smoke，而是直接用已发布包跑
full 5 Soul × 2 executor matrix，验证 0.10.1 在真实包路径下也能跑顺。

## 风险

1. GitHub release workflow 依赖 `NPM_TOKEN` 与 binary upload 流程，可能在远端
   发布阶段失败。
2. full matrix 依赖本机 Codex / Claude Code 认证与外部 executor 稳定性，失败
   需要区分包行为、executor 环境和模型响应波动。
3. `--timeout-ms 240000` 会让单个异常 turn 等待更久；这是本次验证“跑顺”目标下
   的显式选择。

## 范围

- `apps/cli/package.json`
- `README.md`
- `docs/task/REL-025.md`
- `docs/plan/PLAN-160.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- 发布 commit、tag、push、workflow 验证与发布包 QA。

## 非范围

- 不修改 runtime/executor/Brain 代码。
- 不处理 fleet / gateway。
- 不发布 remote fleet upgrade。

## 验证

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- dist package version 与 built CLI `--version`
- `git diff --check`
- `cd apps/cli/dist && bun publish --dry-run --access public`
- GitHub Actions release workflow
- npm latest 与显式 package version smoke
- GitHub Release asset verification
- published-package full Governance Kernel harness

## 进展

- 2026-05-07 15:26：调查和计划完成，开始 release bump 与本地发布 gate。
- 2026-05-07 15:28：本地 release gate passed：frozen install、typecheck、
  lint、test、build、CLI run/fleet smoke、dist version checks、
  `git diff --check`、publish dry-run pack stage。
