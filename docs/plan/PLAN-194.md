# PLAN-194 Route CLI run through daemon run contract

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 16:55
- **approvedAt**: 2026-05-09 16:55
- **completedAt**: 2026-05-09 17:02
- **relatedTask**: REFACTOR-028

## Current State

当前 `apps/cli/src/commands/worker/run.ts`：

- `loadWorkerContext()`；
- `buildRuntime()`；
- 手动写入 `agent_tasks`；
- 构造 `Envelope`；
- 调 `runtime.orchestrator.ingest()`；
- 直接订阅 `runtime.bus`。

这仍是 PLAN-011 时期的 CLI-only demo 路径，不符合 `REFACTOR-026` 的 daemon/web/CLI 共享 run contract。

## Proposal

1. 把现有 in-process 逻辑保留为 `runRunLocal()`。
2. `runRun()` 默认执行 daemon path：
   - 从 `loadWorkerContext({ silent: true })` 读取 bearer token；
   - 用 `workerEnv.PORT` 和 `AIW_LOCAL_WORKER_HOST` 计算本地 daemon URL；
   - `POST /api/worker/runs` 创建 run；
   - `GET /api/worker/runs/:id/events` 解析 SSE；
   - `orchestrator.finished` -> exit 0，`orchestrator.error` -> exit 1，timeout -> exit 124。
3. 新增 `--local` CLI option，用于显式走旧 in-process path。
4. 更新 tests：
   - 默认 daemon path 成功；
   - daemon path HTTP error；
   - `--local` 终态映射；
   - timeout 行为。

## Risks

- 需要 daemon 已启动。默认路径会暴露这一要求；错误消息必须提示 `aiworker serve` / 后续 `aiworker daemon start`。
- 现有 `--chat-id` 在 daemon path 不再生效；本 slice 保留参数但只在 `--local` 中使用，避免改 `/api/worker/runs` contract。
- run-scoped SSE 当前不 replay 历史事件；极快 run 仍可能在订阅前结束，后续 slice 应补 replay/polling。

## Verification

- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/run.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 16:55：认领 S1B；准备将 CLI run 默认路径切到 daemon `/api/worker/runs`。
- 2026-05-09 17:02：完成默认 daemon run path、`--local` fallback、help 文案与聚焦 CLI
  tests；CRG 审查显示 0 affected flows，risk 0.60，静态 test gap 已由 focused tests
  与 CLI typecheck 覆盖。
