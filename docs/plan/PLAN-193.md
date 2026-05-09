# PLAN-193 Worker run contract compatibility layer

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 16:46
- **approvedAt**: 2026-05-09 16:46
- **completedAt**: 2026-05-09 16:55
- **relatedTask**: REFACTOR-027

## Current State

现有 worker 执行路径分裂在三个层面：

- core：`Orchestrator.submitTask()` / `continueConversation()` 创建 `agent_tasks`，再异步
  `ingest()` envelope。
- API：`apps/api/src/worker/orchestrator/routes.ts` 暴露 `/tasks` 和
  `/conversations/:id/messages`。
- Web：`apps/web/src/worker/api.ts` 直接调用 `/api/worker/orchestrator/*`。
- CLI：`apps/cli/src/commands/worker/run.ts` 直接 in-process 构造 `web` envelope 并订阅
  runtime bus。

这使产品语义仍停留在 orchestrator task，而不是 OD-style run。

## Proposal

本 slice 做兼容层，不做破坏性迁移：

1. 新增 core `WorkerRunService`：
   - `listRuns()` 从 `agent_tasks` 读取并按 createdAt 倒序返回；
   - `getRun(id)` 读取单个 task 并映射为 run；
   - `createRun({ prompt, conversationId? })` 调用现有 orchestrator；
   - `cancelRun(id)` 使用 `conversationId -> ProcessManager.cancelGroup()` 中止可取消 run；
   - 终态或不可取消状态返回明确错误。
2. 新增 API route `apps/api/src/worker/runs/routes.ts`：
   - zod 校验 prompt 和 conversationId；
   - `/runs/:id/events` 复用 runtime bus，按 `taskId` 过滤事件；
   - route 挂到 `/api/worker/runs`。
3. 更新 Worker Web API：
   - `submitTask()` 改为 `POST /api/worker/runs`；
   - `continueConversation()` 改为同 endpoint + `conversationId`；
   - 类型仍兼容 `AgentTaskRow`，UI 不做结构性改动。
4. 更新 OpenAPI path registry 和 focused tests。

## Risks

- 这是过渡层，底层表仍叫 `agent_tasks`，旧事件仍叫 `orchestrator.*`。文档和测试必须明确它是兼容层。
- `cancelRun()` 对尚未绑定 conversationId 的 queued run 不能可靠取消；本 slice 返回可解释的 400。
- web UI 仍显示 conversation/chat 形态，不等于 S5 workbench 已完成。

## Verification

- `bun test packages/core/src/worker/runs/service.test.ts`
- `bun test apps/api/src/worker/runs/routes.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 16:46：完成 S1 调查，确认先做 `/api/worker/runs` 兼容层，保留旧路径。
- 2026-05-09 16:55：完成 core `WorkerRunService`、worker `/api/worker/runs` route、filtered run SSE、OpenAPI registry、web submit/continue 调用切换和聚焦测试。
