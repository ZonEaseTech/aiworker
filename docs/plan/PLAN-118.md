# PLAN-118 Codex continuity and tool-call parity

- **status**: completed
- **createdAt**: 2026-05-06 01:25
- **approvedAt**: 2026-05-06 01:25
- **completedAt**: 2026-05-06 01:55
- **relatedTask**: BUG-069, BUG-070

## 现状

QA-006 发现 `codex/default` 与 `claude-code/default` 有两处 P1 parity 差距：

- 同一个 `--chat-id` 在 Codex 上被拆成多个 AIWorker conversation，导致
  session currentConversationId 跳到最后一个 conversation，早期 marker 召回失败。
- 当前 Codex app-server 协议会发出 `rawResponseItem/completed`、
  `item/started`、`item/completed` 等 tool/function/command 事件，但 adapter 只归一化
  assistant text、reasoning、token usage 和 turn completion，导致
  `orchestrator.tool_call` 为 0。

真实本机 Codex probe 已确认当前协议的工具形态包括：

- `rawResponseItem/completed` + `item.type=function_call`
- `item/started` / `item/completed` + `item.type=commandExecution`
- `rawResponseItem/completed` + `item.type=function_call_output`

## 方案

1. **Codex chat-id 强连续性**
   - 对已有 session entry 的 Codex route，在 Worker Admin reset / selected continuation
     之后、LLM classifier 之前直接继续当前 conversation。
   - 保留显式 gateway reset 语义；不影响新 chat-id 创建 conversation。
   - 增加 5-turn 回归：同一 Codex chat-id 只产生 1 个 conversation，消息数累积，
     engine binding 持续更新。

2. **当前 Codex tool event 归一化**
   - 扩展 Codex current event types，覆盖 function call、command execution 和
     function call output。
   - `function_call` 归一化为 `tool_use`，保留 tool name、parsed arguments 和 call id。
   - `commandExecution` start/completed 归一化为同一 id 的 command-run tool lifecycle。
   - `function_call_output` 归一化为 `tool_result`，保留 correlation id 与输出。
   - 让 `exec_command` / `commandExecution` 推断为 shared `command_run` action。

3. **Fixture / docs / tracking**
   - 更新 Codex stub current protocol fixture，让 executor test 覆盖当前 tool frames。
   - 更新 `docs/executor-engines.md` 说明 Codex 当前 shell exec 的 granularity。
   - 完成 BUG-069 / BUG-070 任务记录与 changelog。

## 风险

1. **conversation classifier 覆盖减少**：Codex 显式 chat-id 连续性优先于 topic split；
   这是 BUG-069 acceptance 的产品 contract，reset 仍可显式开启新 conversation。
2. **tool event 重复**：当前 Codex 对一次 shell action 同时提供 logical function call
   和 command execution lifecycle；adapter 使用相同 call id 保留 correlation，消费者可按
   id 合并状态。
3. **CLI 版本漂移**：未知 Codex event 仍保持 no-op；新增 shapes 为宽松解析。

## 范围

- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/executor/engines/codex/types.ts`
- `packages/core/src/worker/executor/engines/codex/normalize.ts`
- `packages/core/test-fixtures/cli/codex-stub.mjs`
- Codex normalizer / executor / orchestrator history focused tests
- `docs/executor-engines.md`
- `docs/task/BUG-069.md`
- `docs/task/BUG-070.md`
- `docs/changelog.md`

## 非范围

- 不实现 executor tool approval / policy enforcement。
- 不把 Codex native tool semantics 迁入 Brain Kernel。
- 不修改 worker.db / fleet.db schema。
- 不处理 BUG-071 / BUG-072 / BUG-073。

## 验证

```bash
bun test ./packages/core/src/worker/executor/engines/codex/normalize.test.ts ./packages/core/src/worker/executor/engines/codex/executor.test.ts ./packages/core/src/worker/orchestrator/service.history.test.ts
bun run --filter '@zonease/aiworker-core' typecheck
bun run lint
git diff --check
```

## 进度

- 2026-05-06 01:25：立项并 claim BUG-069 / BUG-070；真实 Codex probe 已确认当前协议
  tool event shape，开始实施 adapter parity 与 Codex chat-id continuity regression。
- 2026-05-06 01:55：完成 Codex 显式 chat-id session continuity bypass、当前协议
  function_call / commandExecution / function_call_output tool event 归一化、current protocol
  fixture 与 docs 更新。验证通过：
  `bun test ./packages/core/src/worker/executor/engines/codex/normalize.test.ts ./packages/core/src/worker/executor/engines/codex/executor.test.ts ./packages/core/src/worker/orchestrator/service.history.test.ts`
  (74 pass), `bun run --filter '@zonease/aiworker-core' typecheck`, `bun run lint`,
  `bun run typecheck`, `bun run test`。
