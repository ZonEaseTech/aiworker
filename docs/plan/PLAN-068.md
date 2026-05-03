# PLAN-068 Persist orchestrator task lifecycle rows

- **status**: completed
- **createdAt**: 2026-05-02 21:37
- **approvedAt**: 2026-05-02 21:37
- **completedAt**: 2026-05-02 21:46
- **relatedTask**: BUG-045

## 现状

1. `Orchestrator.submitTask()` 和 `Orchestrator.continueConversation()` 只在
   `agent_tasks` 插入 `queued` 行，然后 fire-and-forget 调用 `ingest()`。
2. `ingest()` / `run()` 已经能从 envelope raw payload 取到 `taskId`，并且
   会在 `conversation.created`、`orchestrator.text`、`orchestrator.finished`
   和 `orchestrator.error` 事件里带出这个 id。
3. 当前执行路径没有任何地方把 `agent_tasks.status` 从 `queued` 改成
   `running` / terminal，也没有写入 `conversation_id`、`finished_at`、
   `result` 或 `error`。
4. `createConversation()` 只把 `taskId` 放进 event payload，没有持久化到
   `conversations.task_id`。
5. `worker.db` schema 和既有 migration 已经包含所需字段，不需要 schema
   变更。

## 方案

1. 在 orchestrator service 内增加小型任务生命周期 helper：
   `markTaskRunning`、`markTaskSucceeded`、`markTaskFailed`，仅在 envelope 带
   `taskId` 时更新 `agent_tasks`。
2. 在 `ProcessManager.onSpawn` 阶段把任务从 `queued` 标记为 `running`，并写入
   `agent_tasks.conversation_id`；这样排队阶段仍保持 `queued`。
3. 在 assistant 成功落库并发出 `orchestrator.finished` 前后，把任务标记为
   `succeeded`，写入 `finished_at` 和简短 `result` metadata，例如
   `conversationId`、`assistantMessageId`、`assistantTextLength`。
4. 在 executor 返回 error 或 ingest/process 层抛错时，把任务标记为 `failed`，
   写入 `finished_at` 和长度受限的 error 文本。
5. 在创建 task-backed conversation 时写入 `conversations.task_id`；对 selected
   conversation continuation，则只补齐 `agent_tasks.conversation_id`，避免单个
   conversation 的多个后续任务互相覆盖 `task_id` 语义。
6. 增加 core orchestrator tests，覆盖新任务成功、selected continuation 成功、
   executor failure 三条生命周期路径。

## 风险

1. `submitTask()` / `continueConversation()` 仍是异步 fire-and-forget，测试需要
   等待 DB terminal 状态而不是只等返回值。
2. `conversations.task_id` 是单值字段，不适合表达同一 conversation 下的多次
   selected continuation；本计划不改 schema，避免扩大 BUG-045。
3. 如果 `ingest()` 在解析 conversation 前失败，只能写 `failed`，无法写
   `conversation_id`。
4. 失败信息必须截断，避免把 executor 内部长错误或敏感上下文完整写进任务行。

## 范围

- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/orchestrator/service.history.test.ts`
- `docs/task/BUG-045.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不改 `agent_tasks` / `conversations` schema 和 migration。
- 不新增 Worker Admin 任务视图 UI。
- 不实现任务取消 API。
- 不处理 `BUG-046` executor probe timeout。
- 不做真实 Codex-backed Worker Admin smoke，除非聚焦测试无法覆盖问题。

## 验证

- Passed: `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Passed: `bunx eslint packages/core/src/worker/orchestrator/service.ts packages/core/src/worker/orchestrator/service.history.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' test`
- Passed: `git diff --check`

## 结果

- `agent_tasks` 现在从 `queued` 进入 `running`，并在执行完成后落到
  `succeeded` / `failed` / `cancelled` terminal 状态。
- 新建 task-backed conversation 会写入 `conversations.task_id`，任务行会写入
  `conversation_id`，Worker Admin 可从任务追到处理它的 conversation。
- 成功任务写入 `conversationId`、`assistantMessageId` 和
  `assistantTextLength` result metadata；失败任务写入完成时间和截断后的
  redacted error。
- selected conversation continuation 只更新 `agent_tasks.conversation_id`，不把
  多次后续任务覆盖到单值 `conversations.task_id`。
