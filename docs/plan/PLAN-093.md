# PLAN-093 Bring-your-own executor thin adapter contract

- **status**: draft
- **createdAt**: 2026-05-04 11:22
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
