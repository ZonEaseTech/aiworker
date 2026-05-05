# PLAN-121 发布 aiworker CLI 0.9.0

- **status**: in-progress
- **createdAt**: 2026-05-06 03:20
- **approvedAt**: 2026-05-06 03:20
- **completedAt**:
- **relatedTask**: REL-016

## 现状

1. npm `@zonease/aiworker-cli` latest 是 `0.8.0`。
2. GitHub Release latest 是 `v0.8.0`，非 draft / 非 prerelease，4 个平台 binary 已发布。
3. 本地与远端最新 release tag 是 `v0.8.0`；远端不存在 `v0.9.0` tag。
4. 自 `v0.8.0` 至 `HEAD (cd5cfbb)` 共 7 个 commit，release-relevant 范围集中在 QA-006 之后的 Brain Governance Kernel 决策与 retained defect 收口：
   - `32c166e` docs：收口 REL-015 / PLAN-113，记录 CLI 0.8.0 发布结果。
   - `05bf551` / `7adc00a` docs(skills)：把 0.7.0 / 0.8.0 调试发现反哺到 release-debug skill。
   - `6bccb65` docs(pma)：落盘 QA-006 端到端调试发现并立 `BUG-066..074` / `TODO-026`。
   - `a3553c5` docs：落盘 Brain Governance Kernel 决策与 backlog reset（DOC-005 / DOC-006 / PLAN-114 / PLAN-115）。
   - `f80e70f` fix(orchestrator)：收口 decision events 与 brain status 的 truthfulness contract（PLAN-116）。
   - `cd5cfbb` feat：收敛 Brain Governance Kernel 剩余阶段（PLAN-117..120）。
5. 本次按 semver 0.x 走 `0.9.0` minor：
   - `PLAN-116`：decision event schema v2 与 brain status 新增 `decisionPipeline` truthfulness surface；fallback raw output 脱敏留证。
   - `PLAN-117`：`aiworker brain admission propose` 提升为正式 pending proposal 入口；init 模板写入 Brain admission governance 指引；orchestrator / Worker Admin 暴露 bypass suspected warning。
   - `PLAN-118`：Codex same `chat-id` continuity 修复；当前 Codex protocol tool/function/command frames 归一化到 AIWorker shared tool events。
   - `PLAN-119`：`executor doctor` header/body status rubric 统一；`aiworker init` 默认不再向 stdout 打完整 bootstrap token / master key，改写 chmod 0600 token file，`--show-token` 才显式输出。
   - `PLAN-120`：command group `--help`、unknown command 语义、executor recommendation advisory-only 文案、`executor mcp add --arg -y` parser polish。
6. `TODO-027` 已作为发布后 Governance Kernel regression harness 入口保留为 pending，不阻塞本次 release。

## 方案

1. Bump `apps/cli/package.json` 到 `0.9.0`。
2. 同步 `REL-016` / `PLAN-121` / changelog 发版记录。
3. 跑本地 release gates：
   - `bun install --frozen-lockfile`；
   - root typecheck；
   - root lint；
   - workspace tests；
   - root build；
   - CLI run / fleet smoke；
   - `apps/cli/dist/package.json` 版本字段断言；
   - `git diff --check`；
   - publish dry-run pack 阶段。
4. 用 conventional commit 提交 release bump：`chore(release): 发布 CLI 0.9.0`。
5. 打 `v0.9.0` annotated tag。
6. push `main` 与 tag，监控 GitHub Actions release workflow，然后验证 npm 与 GitHub Release。

## 风险

1. GitHub repository 的 `NPM_TOKEN` 缺失或过期会导致 release workflow 在 publish 阶段失败。
2. `PLAN-116` schema v2 / `brainSummary.decisionPipeline` 是 pre-1.0 breaking surface；旧 consumer 需要同步 typed client / shared schema。
3. `PLAN-117` 正式开放 `admission propose` 入口，但 propose 只写 pending row；operator approval / apply 仍需显式执行，不能把它当作 durable mutation 已完成。
4. `PLAN-118` Codex tool event 会同时保留 logical function_call 与 commandExecution lifecycle；消费者应按 correlation id 合并或去重。
5. `PLAN-119` 默认不再向 stdout 打完整 bootstrap token；依赖 grep stdout 的脚本需要改读 token file 或显式 `--show-token`。
6. `PLAN-120` 真实 unknown command 不再静默落回顶级 help；脚本若依赖旧的 0 exit help fallback，需要改用明确的 group `--help`。

## 范围

- `apps/cli/package.json`
- `docs/task/REL-016.md`
- `docs/task/index.md`
- `docs/plan/PLAN-121.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不修改 release workflow（`.github/workflows/release.yml`）。
- 不 bump 其它 workspace package version（仅 cli 发 npm）。
- 不重建 fleet.db / worker.db。
- 不改 Caddy、测试服或外部入口配置。
- 不执行 `TODO-027` 的 published-package regression campaign；该项留给后续 QA 任务。

## 验证

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- `apps/cli/dist/package.json` 版本字段 = `0.9.0`
- `git diff --check`
- publish dry-run pack 阶段
- GitHub Actions release workflow 全绿
- `npm view @zonease/aiworker-cli version` → `0.9.0`
- `gh release view v0.9.0` → 4 个平台 binary uploaded

## 进度

- 2026-05-06 03:20：PLAN-121 / REL-016 创建，进入 implementing。npm latest
  确认为 `0.8.0`；GitHub Release `v0.8.0` 正常；远端不存在 `v0.9.0`
  tag。本次按 `0.9.0` minor release 执行。
- 2026-05-06 03:40：本地 release gates 全通过：`bun install
  --frozen-lockfile`、`bun run typecheck`、`bun run lint`、`bun run test`、
  `bun run build`、CLI run / fleet smoke、dist manifest version check、built
  CLI `--version`、`git diff --check`。`bun publish --dry-run --access public`
  在 `apps/cli/dist` 完成 pack 阶段（30 files / 2.69 MB），随后停在本机
  npm authentication boundary；正式发布仍走 tag-triggered GitHub Actions
  workflow 的 `NPM_TOKEN`。
