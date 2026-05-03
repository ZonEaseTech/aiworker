# PLAN-074 Executor readiness semantics and first-run guidance

- **status**: completed
- **createdAt**: 2026-05-03 13:09
- **relatedTask**: FEAT-047

## 现状

1. `ensureProjectAiworker()` 会 seed `.aiworker/executor-capabilities.json`，默认内容是 `{ "schemaVersion": 1, "engines": {} }`。
2. `aiworker executor doctor --engine codex` 在 manifest 为空时只检查 `codex` binary 是否存在，因此会输出 `Status: PASS`。
3. `aiworker up --dry-run` 的 executor readiness 阶段能打印 `no executor capabilities declared`，但它仍使用 non-blocking PASS 语义，operator 容易误解为 “executor 已经配置好手脚”。
4. 新 worker 的 stored config 可能仍是默认 executor；是否已经选择 Codex/Claude task executor 与 executor capability manifest 是否声明 MCP，是两个独立状态。
5. FEAT-045 明确 `up` 当前不自动选择 engine、不写 engine project config；这个边界仍应保留。

## 方案

调整 readiness / doctor 的状态模型与输出层级，不改变 runtime 执行路径：

1. 在 executor readiness report 中区分四类状态：
   - configured task executor：当前 worker config 是否已经选择目标 engine。
   - engine CLI availability：目标 engine CLI 是否可见。
   - declared capabilities：manifest 是否为空、是否包含目标 engine 声明。
   - projection compatibility：声明是否能生成当前 engine CLI 支持的 projection command。
2. `executor doctor` 增加 “empty capability manifest” 的 warning/notice，而不是仅用 PASS 总结。
3. `up` 在 executor readiness 阶段输出下一步建议：
   - 未选择 Codex/Claude executor：提示 executor bootstrap/选择命令或当前 `config set` 路径。
   - 已选择 engine 但 manifest 为空：提示能力为空是可运行但受限的状态。
   - manifest 有声明但 projection 不兼容：提示运行 `executor mcp sync --dry-run` 并展示失败原因。
4. 保持 `up` non-blocking；只有 project capability validation 的 error 继续阻断启动。

## 范围

- CLI executor readiness / doctor 输出与数据结构。
- `aiworker up --dry-run` / `executor doctor` 聚焦测试。
- CLI docs / README 中 first-run executor guidance。
- PMA 状态同步。

## 非范围

- 不修改 executor run path。
- 不自动选择 task executor engine。
- 不投影 MCP 或写 engine project config。
- 不扩展 manifest schema 到 skill/plugin。

## 风险

1. 输出语义变细后，已有测试里对 `PASS` 文案的断言会变动；只改相关聚焦测试。
2. 如果读取 worker config 需要 bootstrap 本地 state，需确保 `doctor` 的副作用边界清晰：project manifest 静态检查与 runtime config 检查不能混淆。
3. 过度严格会破坏 `up` 的便携性；本计划只把 executor 空缺表达清楚，不把它变成启动 blocker。

## 验证

- `bun test apps/cli/src/commands/worker/executor.test.ts`
- `bun test apps/cli/src/commands/worker/up.test.ts apps/cli/src/commands/worker/up.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `/Users/ben/projects/aiben` 手工 smoke：
  - `aiworker up --dry-run`
  - `aiworker executor doctor --engine codex`

## 交付标准

Operator 能一眼区分 “engine CLI 可用” 与 “executor-native 能力已声明/已投影”；空 manifest 不再被误读成完整 executor bootstrap。

## 完成记录

- 2026-05-03 13:44：完成 readiness report 扩展，`executor doctor` 和 `up` stage 4 会显示 configured task executor、declared executor-native capabilities、engine CLI availability 与 projection compatibility。空 manifest / 默认 stub executor 现在是 WARN，不再显示为完整 PASS。
- 验证：`bun test apps/cli/src/commands/worker/executor.test.ts`、`bun test apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/worker/init.integration.test.ts packages/shared/src/executor-capabilities.test.ts`、`bun run --filter '@zonease/aiworker-cli' typecheck`。
- `/Users/ben/projects/aiben` smoke：`aiworker executor doctor --engine codex` 显示 `configured task executor: codex/default` PASS、manifest empty WARN、Codex binary PASS；`aiworker up --dry-run` stage 4 显示同一 non-blocking WARN。
