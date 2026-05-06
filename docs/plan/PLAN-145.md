# PLAN-145 Claude Code default model belongs to the external CLI

- **status**: completed
- **createdAt**: 2026-05-07 00:17
- **approvedAt**: 2026-05-07 00:17
- **completedAt**: 2026-05-07 00:30
- **relatedTask**: BUG-086

## 现状

1. AIWorker 的产品边界已经收敛为轻量 Project Brain governance node：
   Brain 守治理不变量，executor runtime 拥有模型、provider、auth、MCP、
   plugin、sandbox 与 native session。
2. `claude-code/default` 仍在默认 profile 里写死 `model: 'sonnet'`。
3. PLAN-144 source compact harness rerun 显示该 alias 在当前 Claude Code
   account/provider 环境下解析为不可用模型，导致所有 Claude Code executor
   turns 失败。
4. 这个失败说明默认 profile 仍带有过重的 executor-owned routing 假设。

## 方案

1. 从 `claude-code/default` variant body 中移除 `model`，让 Claude Code CLI
   使用当前 operator account / host config 的默认模型。
2. 保留显式 override 语义：
   - `overrides.model` / `modelId` 仍由 adapter 转发；
   - 该字段是 best-effort executor hint，不是 AIWorker 的兼容性承诺。
3. 同步 Worker Admin variant 文案和 executor engine 文档，避免默认 UI
   继续暗示 Sonnet 固定绑定。
4. 添加 focused regression，保证默认 profile 不再携带模型。

## 风险

1. `/api/worker/info` 或 decision events 对 Claude Code default 可能不再暴露
   `model` 字段；这是更真实的状态，不应补假值。
2. 依赖旧默认 `sonnet` 的 operator 需要显式配置 `model` / `modelId`；1.0
   前按当前架构语义收敛，不做 legacy shim。

## 范围

- `packages/core/src/worker/executor/default-profiles.ts`
- `packages/core/src/worker/executor/default-profiles.test.ts`
- `apps/web/src/worker/features/config/executor-variants.ts`
- `docs/executor-engines.md`
- PMA task/plan/changelog/index

## 非范围

- 不新增 model discovery。
- 不改 Codex/Cursor/ACP/HTTP executor 默认 profile。
- 不改 fleet/gateway。
- 不发布 release。

## 验证

1. `bun test packages/core/src/worker/executor/default-profiles.test.ts`
2. `bun test packages/core/src/worker/executor/engines/claude-code/executor.test.ts`
3. `bun run lint`
4. `bun run typecheck`
5. `bun run test`
6. `bun scripts/governance-kernel-harness.ts --help`
7. `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts --mode worker-source-local --matrix compact --debug-root tmp/governance-kernel-plan144-source-3 --port-base 19680 --timeout-ms 180000`

## 进度

- 2026-05-07 00:17：PLAN-144 source compact run 暴露 Claude Code forced
  default model failure，创建 BUG-086 / PLAN-145 并收敛默认模型边界。
- 2026-05-07 00:30：实现完成并通过 focused tests、lint、typecheck、全量
  test 和 source compact Governance Kernel harness。
