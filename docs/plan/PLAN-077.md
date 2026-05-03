# PLAN-077 Engine-native capability lifecycle beyond MCP

- **status**: completed
- **createdAt**: 2026-05-03 13:09
- **relatedTask**: FEAT-047

## 现状

1. `.aiworker/executor-capabilities.json` 当前主要覆盖 executor-native MCP server 声明。
2. FEAT-044 的 schema 预留了 `plugins` / `skills` 字段，但没有定义 lifecycle、projection adapter、doctor 规则或 secret policy。
3. Brain capability 与 Executor capability 必须隔离：brain skill / Soul pack / runtime toolset 不能被复用成 engine-native plugin/skill 配置。
4. 不同 engine 的 native extension 形态差异大，AIWorker 不应该发明跨 engine 的伪标准执行格式。

## 方案

先定义 lifecycle 与 manifest 语义，再按 engine 小步实现：

1. Capability taxonomy：
   - `executor mcp`：engine 可连接的 MCP server。
   - `engine plugin`：engine 官方 plugin/extension。
   - `engine skill`：engine-native skill/prompt/tool package。
   - `engine policy`：sandbox、approval、project trust 等 engine runtime policy。
2. Manifest schema：
   - 每类 capability 有 `status`、`scope`、`source`、`disabled`、`validation`。
   - Secret-like 字段只能存 `secretRef`。
   - 支持 `projectionState` 记录 last dry-run/apply hash，但不保存明文 secret。
3. CLI lifecycle：
   - `executor capability list/show/doctor` 先只读。
   - mutating add/sync 命令按 engine adapter 分开实现。
4. Projection adapter：
   - 每个 engine 只调用官方 CLI 或官方配置格式。
   - 不支持的组合 fail clearly。

## 范围

- 设计并落地 executor-native lifecycle schema 的最小可用版本。
- CLI read-only inspect / doctor 表面。
- 文档明确 brain/runtime capability 与 executor-native capability 边界。
- 为后续 Codex/Claude plugin/skill projection 预留 adapter 结构。

## 非范围

- 不把 brain skill 自动转成 engine skill。
- 不实现所有 engine 的 plugin/skill projection。
- 不把 executor capability 状态存入 `worker.db` configJson。
- 不做云端 registry 或远程同步。

## 风险

1. 过早抽象会绑死未来 engine 形态；schema 应保持 descriptor + adapter，而不是统一运行时执行模型。
2. 名称容易和 brain skill / capability pack 混淆；CLI、docs、API 输出必须带 `executor` / `engine-native` 限定词。
3. Secret projection 一旦做错会写明文；本阶段只做声明、校验和 dry-run，apply 必须明确受限。

## 验证

- shared schema tests
- CLI doctor/list/show tests
- docs boundary review
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 交付标准

Executor-native capability 不再只是 MCP 特例，而有清晰 lifecycle、边界、doctor 输出和后续 adapter 扩展点；同时不污染 brain/runtime capability 系统。

## 完成记录

- 2026-05-03 13:44：`.aiworker/executor-capabilities.json` schema 增加 engine plugin / engine skill / engine policy lifecycle descriptor（`status`、`scope`、`source`、`disabled`、`validation`），继续与 brain skill、Soul capability pack、runtime toolset 和 `.aiworker/mcp.json` 隔离。
- 新增 `aiworker executor capability list` / `show` 只读检查；`executor doctor` 会把 engine-native descriptor 中的 secret-like 明文字段报错。
- 验证：`bun test packages/shared/src/executor-capabilities.test.ts`、`bun test apps/cli/src/commands/worker/executor.test.ts`、`bun run --filter '@zonease/aiworker-shared' typecheck`、`bun run --filter '@zonease/aiworker-cli' typecheck`。
