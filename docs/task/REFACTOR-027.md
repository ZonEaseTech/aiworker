# REFACTOR-027 Worker run contract compatibility layer

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 16:46
- **claimedAt**: 2026-05-09 16:46
- **completedAt**: 2026-05-09 16:55
- **plan**: PLAN-193
- **relatesTo**: REFACTOR-026, PLAN-192, packages/core/src/worker, apps/api/src/worker, apps/web/src/worker

## 背景

`REFACTOR-026` 已把产品北极星切到 Open Design-style local worker loop。当前实现仍然把默认
HTTP/web 提交路径命名为 orchestrator task：

- web `submitTask()` 调 `POST /api/worker/orchestrator/tasks`；
- web continuation 调 `POST /api/worker/orchestrator/conversations/:id/messages`；
- SSE 是全局 `/api/worker/events/stream`，事件仍是 `orchestrator.*`；
- CLI `aiworker run` 仍直接 in-process 构造 envelope，不经过 daemon run API。

第一步不应该直接做 DB schema 大迁移，而是先建立稳定的 `run` contract，让 web 和 daemon 有一个
可继续演进的统一表面。

## 目标

1. 在 core 中引入 `WorkerRunService`，把现有 `agent_tasks` 映射成目标 `run` 语义。
2. 在 worker API 暴露 `/api/worker/runs`：
   - `GET /runs`
   - `POST /runs`
   - `GET /runs/:id`
   - `GET /runs/:id/events`
   - `POST /runs/:id/cancel`
3. web submit/continue 改走 `/api/worker/runs`，保留现有函数名以降低 UI diff。
4. 保留旧 `/orchestrator/tasks` 路径作为过渡兼容层，不在本 slice 删除。
5. 用聚焦 API/web/core 测试证明新 run contract 可用。

## 非目标

- 不做 worker.db schema 破坏性迁移。
- 不重写 CLI daemon lifecycle。
- 不重构 Worker Web 首屏。
- 不删除旧 orchestrator/case/brain routes。
- 不实现 artifact index 或 lesson promotion。

## 验收标准

- `WorkerRunService` 能 list/show/create/cancel，并复用现有 orchestrator 执行。
- `POST /api/worker/runs` 能提交新 run；带 `conversationId` 时能继续会话。
- `GET /api/worker/runs/:id/events` 能按 run id 过滤 SSE。
- web `submitTask` / `continueConversation` 调用新 `/api/worker/runs` endpoint。
- 聚焦测试通过，code-review-graph 完成变更审查。

## 验证记录

- `bun run --filter '@zonease/aiworker-core' test -- src/worker/runs/service.test.ts`：通过，5 pass。
- `bun run --filter '@zonease/aiworker-api' test -- src/worker/runs/routes.test.ts`：通过，5 pass。
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts`：通过，9 pass。
- `bun run --filter '@zonease/aiworker-api' test -- src/modes/worker.openapi.test.ts`：通过，1 pass。
- `bun run --filter '@zonease/aiworker-core' typecheck`：通过。
- `bun run --filter '@zonease/aiworker-api' typecheck`：通过。
- `bun run --filter '@zonease/aiworker-web' typecheck`：通过。
- `git diff --check`：通过。
