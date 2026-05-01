# PLAN-058 清理 CLI 运行时旧命名前缀

- **status**: completed
- **createdAt**: 2026-05-02 01:01
- **approvedAt**: 2026-05-02 01:31
- **completedAt**: 2026-05-02 01:38
- **relatedTask**: BUG-010

## 现状

BUG-010 仍有当前代码证据，主要集中在 CLI 的用户可见输出和 operator 本地状态命名：

1. Worker-local 命令仍打印 `[aiw run]`、`[aiw serve]`、`[aiw config set]`、`[aiw token rotate]`、`[aiw schedule ...]` 等运行时前缀。
2. OTP enrollment 提示仍要求执行 `aim enroll approve <otp>`，会误导只知道 `aiworker` 单二进制的新用户。
3. `aiworker pair --help` 的 `--url` 说明仍说默认来自 `aim.json`。
4. operator state 仍落在 `~/.aiworker/aim.json`，并且 daemon pid/log 仍是 `aim-gateway.pid` / `aim-gateway.log`。用户已确认尚未正式生产投入，本次按最新命名做 clean rename，不保留 legacy 文件名。
5. 大量 `aim` / `aiw` 余留是内部 `apps/cli/src/aim/` 目录、import path、历史任务/计划、gateway-proto 包名或开发注释；这些不等同于用户可见运行时输出。

## 方案

1. 把所有当前用户可见 CLI runtime 前缀从 `aiw` 改为 `aiworker`：
   - `apps/cli/src/commands/run.ts`
   - `apps/cli/src/commands/serve.ts`
   - `apps/cli/src/commands/config.ts`
   - `apps/cli/src/commands/token.ts`
   - `apps/cli/src/commands/schedule.ts`
2. 把 OTP approval 指令改成 `aiworker enroll approve <otp>`。
3. 把 operator 本地状态文件从 `~/.aiworker/aim.json` 改为 `~/.aiworker/aiworker.json`，并同步代码注释、错误/警告文案、CLI help、README 与当前 docs。
4. 把 gateway daemon pid/log 文件从 `aim-gateway.pid` / `aim-gateway.log` 改为 `aiworker-gateway.pid` / `aiworker-gateway.log`，保持同一命名策略。
5. 更新与本切片直接相关的测试描述或断言；不改历史 PLAN/FEAT/BUG/changelog 条目里的旧命名。
6. 完成后同步 BUG-010 状态、PLAN-058 状态和 changelog。

## 风险

1. **状态文件 rename 破坏升级**：用户已确认尚未正式生产投入，接受 clean break；本轮不做旧文件自动迁移。
2. **grep 结果仍有旧称**：由于 `apps/cli/src/aim/` 内部目录、import path、gateway-proto 包名和历史文档会继续命中，需要把验证口径限定为“用户可见输出无旧命名前缀，剩余命中有明确保留理由”。
3. **测试噪声扩大**：优先跑 CLI package 聚焦测试；如果变更触及 core 注释或 docs，不扩大全量 gate。

## 工作量

小型 CLI + docs 修复，预计改动 10-15 个文件，不涉及 DB schema、API contract、Web UI 或发布脚本。

## 验证计划

1. `bun run --filter '@zonease/aiworker-cli' test`
2. `bun run --filter '@zonease/aiworker-cli' typecheck`
3. `rg -n "\\[aiw(\\s|\\])|aim enroll approve|\\baiw\\b|aim\\.json|aim-gateway|~/.aiworker/aim" apps/cli/src apps/cli/scripts packages/core/src packages/gateway/src packages/gateway-proto/src apps/api/src docs/cli.md docs/gateway.md docs/architecture.md README.md`

## 备选方案

1. **保留 `aim.json` 并标注 legacy**：不采用。用户已确认无需兼容未正式投入生产的旧命名。
2. **只改 stdout/stderr，不碰 docs/help**：不够。`aiworker pair --help` 和当前 README 仍会把新用户带回旧文件名语义。
3. **彻底迁移 `apps/cli/src/aim/` 目录**：不纳入本次。任务已明确目录名可作为内部实现细节保留，重命名会制造大量 import churn。

## 批注

- 2026-05-02 01:01：调查完成，等待用户批准实施。
- 2026-05-02 01:30：用户确认不保留 legacy 文件名，按最新版本 clean rename。
- 2026-05-02 01:31：用户批准实施，进入 implementing。
- 2026-05-02 01:38：实施完成。CLI test / typecheck 通过，旧 runtime 前缀与旧 state filename grep 无命中；剩余 `aim` 仅为内部 `apps/cli/src/aim` import path。
- 2026-05-02 01:57：REFACTOR-014 / PLAN-060 获批继续清理内部实现路径；PLAN-058 的 `apps/cli/src/aim` 保留说明只作为本计划完成时的历史状态。
