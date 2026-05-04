# PLAN-093 Bring-your-own executor thin adapter contract

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 13:40
- **relatedTask**: FEAT-052

## 现状

AIWorker 已有 `ExecutorProvider.run(...)` 和 `AgentEvent` 归一化层，这本身适合 thin adapter。需要明确新方向下 adapter 不承担 isolation 和完整 capability lifecycle。

## 方案

Thin adapter contract:

1. `health/readiness`
2. `run(input) -> AsyncIterable<AgentEvent>`
3. `cancel` via abort signal
4. `resume` via engine-native binding when supported
5. basic error classification
6. no default isolation promise
7. no complete capability source of truth

## 范围

- docs + type comments。
- factory/default profile guidance。

## 非范围

- 不接入新 engine。
- 不改 `AgentEvent` unless a concrete adapter requires it.

## 风险

如果 contract 过窄，OpenClaw/Hermes 事件形态可能需要补充；保持 adapter-specific extension inside engine module，不污染 orchestrator。

## 验证

- existing executor tests。

## 完成记录

- 2026-05-04 13:40：完成 thin adapter contract 文档化。
  - `packages/shared/src/providers/executor.ts` 加文件头 JSDoc，列出 5 项最小契约（health/run/cancel/resume/error）和 3 条显式不承诺（no isolation / no capability source of truth / no tool loop ownership）；`ExecutorProvider` interface 与 `run` 字段补齐 inline JSDoc。
  - `packages/core/src/worker/executor/factory.ts` `buildExecutor` JSDoc 增加 “Each constructed engine MUST honour the thin adapter contract …” 段，引用 shared 文件头并列出显式不承诺。
  - `docs/architecture.md` 新增 “Thin executor adapter contract” 子章节，给出方法表 + 显式不承诺 + engine-specific extension 留在 engine module 的硬要求。
- 不接入新 engine、不改 `AgentEvent` schema。
- 验证：
  - `bun run --filter '@zonease/aiworker-shared' typecheck` ✅
  - `bun run --filter '@zonease/aiworker-core' typecheck` ✅
  - `bun x eslint packages/shared/src/providers/executor.ts packages/core/src/worker/executor/factory.ts` 无告警
