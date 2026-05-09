# Governance Node Status

> 状态：归档过渡说明。本文过去用于跟踪 governance-first Project Brain node posture。
> `REFACTOR-026` 已经取代这个默认 worker 产品方向。

## 当前解释

旧 governance-node 工作还没有从代码中删除。它仍然可以作为历史证据，支撑这些边界：

- secret redaction；
- source/provenance；
- admission/review state machine；
- audit 与 rollback；
- high-risk action boundary。

但它不再是 first worker surface 的北极星。

新的默认产品闭环见：

- [GOALS.md](../GOALS.md)
- [docs/architecture.md](architecture.md)
- [docs/task/REFACTOR-026.md](task/REFACTOR-026.md)
- [docs/plan/PLAN-192.md](plan/PLAN-192.md)

## 重新归位

旧治理概念只有在能改善新 local worker loop 时才应继续使用：

| Previous concept | New position |
| --- | --- |
| Brain Kernel | Local context quality and provenance guardrails |
| Gate | Optional post-run review signal |
| Admission | Lesson promotion state, after run evidence exists |
| Journal | Run/review provenance where useful |
| Case | Artifact/review bundle, not the default first screen |
| Fleet summary | Deferred aggregation after local worker proof |

如果某个治理概念要求 operator 在提交有用 work order 之前先理解它，它在本轮重构中就处在错误位置。

## 替代证据

未来状态证据应在 `REFACTOR-026` slices 中产生：

1. unified run service evidence；
2. workspace metadata 与 artifact index evidence；
3. worker pack parser 与 built-in pack evidence；
4. CLI daemon lifecycle smoke；
5. worker web browser smoke；
6. review 与 lesson promotion smoke；
7. final release/readiness validation。

在这些 slice 落地前，本文不能用来声称 rebooted worker loop 已完成。
