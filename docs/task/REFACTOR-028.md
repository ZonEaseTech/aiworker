# REFACTOR-028 Route CLI run through daemon run contract

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 16:55
- **claimedAt**: 2026-05-09 16:55
- **completedAt**: 2026-05-09 17:02
- **plan**: PLAN-194
- **relatesTo**: REFACTOR-026, REFACTOR-027, PLAN-192, PLAN-193, apps/cli/src/commands/worker/run.ts

## 背景

`REFACTOR-027` 已经为 daemon/web 建立 `/api/worker/runs` 兼容层，但 CLI `aiworker run`
仍然直接 in-process 构造 runtime 和 envelope，绕过 daemon HTTP/SSE。这会继续保留两套执行心智：

- web/daemon：`POST /api/worker/runs` + per-run SSE；
- CLI：本地构造 `WorkerRuntime` + `orchestrator.ingest()`。

S1B 要把 CLI 默认路径收敛到 daemon run contract。

## 目标

1. `aiworker run` 默认调用本地 daemon `/api/worker/runs` 创建 run。
2. CLI 使用 `/api/worker/runs/:id/events` 输出 run-scoped SSE，终态仍映射到 exit code。
3. 保留 `--local` 作为显式 fallback，继续支持旧的 in-process 直跑。
4. 更新 root 与 `worker run` help 文案，不再把默认行为描述为“不启动 HTTP server”。
5. 补充 CLI focused tests。

## 非目标

- 不实现 `aiworker daemon` 新命令树。
- 不启动 daemon；如果 daemon 不可达，应给出明确错误和启动提示。
- 不删除 in-process fallback。
- 不修改 `/api/worker/runs` contract。

## 验收标准

- 默认 `runRun()` 通过 HTTP 创建 run 并消费 run-scoped SSE。
- `--local` 仍走旧 in-process path，现有终态映射测试保留。
- daemon 不可达或返回非 201 时返回非零退出码。
- 聚焦 CLI tests 和 typecheck 通过。

## 实现记录

- `aiworker run` 默认改为使用本地 daemon `/api/worker/runs` 创建 run，并消费
  `/api/worker/runs/:id/events` 的 run-scoped SSE。
- 新增 `--local` 显式 fallback，保留原 in-process runtime / envelope 路径。
- `--chat-id` 仅在 `--local` 下有效；daemon 默认路径遇到该参数会输出提示。
- root help 与 `worker run` help 已改为 daemon run contract 语义。

## 验证

- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/run.test.ts`
  passed: 8 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-cli' test -- src/aiworker.test.ts`
  passed: 41 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-cli' test -- src/lib/bootstrap.test.ts`
  passed: 2 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-cli' typecheck` passed。
- `git diff --check` passed。
- CRG passed: 11 changed files, 27 changed functions/classes, 0 affected flows,
  risk 0.60；静态 test gap 主要来自新增 CLI helper 和测试 helper，已由 daemon
  success/error/timeout、`--local` terminal mapping、help tests 与 CLI typecheck 覆盖。
