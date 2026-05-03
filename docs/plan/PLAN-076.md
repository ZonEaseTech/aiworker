# PLAN-076 Executor selection bootstrap command

- **status**: completed
- **createdAt**: 2026-05-03 13:09
- **relatedTask**: FEAT-047

## 现状

1. Worker config 支持多 engine executor profile，例如 `codex/default`、`claude-code/default`、`http/default`。
2. 新 worker 当前可能仍从 safe stub/default executor 起步；operator 需要手写 `aiworker config set <json>` 才能切换 task executor。
3. `aiworker up` 按 FEAT-045 设计不自动选择 engine，也不写 engine project config。
4. 本机 Codex 已登录并不等价于该 worker 已选择 Codex executor。

## 方案

新增显式、低副作用的 executor bootstrap/selection 命令，减少手写 JSON：

1. 命令候选：
   - `aiworker executor select --engine codex --variant default`
   - 或 `aiworker executor init --engine codex --variant default`
2. 行为：
   - 读取当前 worker config 与 version。
   - 只更新 `config.executor`，不改 brain、channels、evolution、secrets、executor capability manifest。
   - 默认 dry-run 显示 config diff；apply 需要显式 flag 或确认模式。
   - 保留 `--if-match` 乐观锁，避免覆盖 Worker Admin / fleet 下发的新配置。
3. 输出：
   - 显示当前 executor 与目标 executor。
   - 提示下一步：`executor doctor`、`executor mcp add/sync --dry-run`、`run --dry-run`。
4. 与 `up` 集成：
   - `up` 遇到 default/stub executor 时提示该命令。
   - 不在 `up` 内自动执行该命令。

## 范围

- CLI command registration 和 handler。
- Config management helper / tests。
- Help、README、`docs/cli.md` quick-start 更新。
- PMA tracking。

## 非范围

- 不自动基于本机 CLI availability 选择 engine。
- 不写 Codex / Claude project config。
- 不处理 fleet remote config selection；远端 worker 仍走 fleet config API。
- 不迁移已经初始化的 worker，除非 operator 显式运行命令。

## 风险

1. 更新 config 是持久写入，必须保留 dry-run 和 version guard。
2. 命令命名要避免和 `executor mcp` 混淆；它选择 task executor，不声明 engine-native capability。
3. 如果已有 secrets refs 或 control executor config，更新必须只替换 `config.executor`，不破坏其它字段。

## 验证

- `bun test apps/cli/src/commands/worker/config.test.ts` 或新增 executor selection focused tests
- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `/Users/ben/projects/aiben` smoke：
  - dry-run executor select
  - apply executor select with version guard
  - `aiworker config show`
  - `aiworker run --message "hello" --dry-run`

## 交付标准

Operator 不再需要手写整份 worker config JSON 就能把 local worker 切到 Codex/Claude task executor；该命令仍保持显式、可回滚、无 engine project config 副作用。

## 完成记录

- 2026-05-03 13:44：新增 `aiworker executor select` / `aiworker worker executor select`。默认 dry-run 显示 current -> target；`--apply` 才持久写入；`--if-match` 保留 config version 乐观锁；实现只替换 `config.executor`，不修改 brain、channels、secrets 或 executor capability manifest。
- CLI help、README、`docs/cli.md` 和 init next steps 已加入 first-run executor selection 指引。
- 验证：`bun test apps/cli/src/commands/worker/executor.test.ts` 覆盖 dry-run、apply、version bump；`bun test apps/cli/src/aiworker.test.ts` 覆盖 root/canonical command registration 与 argv folding；`/Users/ben/projects/aiben` dry-run 显示当前已是 `codex/default`。
