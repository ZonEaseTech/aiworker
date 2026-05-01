# FEAT-007 M:1 channel routing (multiple workers, one chat)

- **status**: closed
- **priority**: P3
- **owner**: local
- **createdAt**: 2026-04-21 07:30
- **closedAt**: 2026-05-01 14:53

## 关闭标记 / Reopen Guidance

本任务作为远期 channel routing 占位关闭。当前没有近期产品或部署证据要求多个 worker 共享同一 chat / bot account；继续保留 pending 会让 backlog 失真。

未来如真实出现 M:1 channel 需求，应按新的 gateway / worker / channel 边界重开，并先明确共享 credential、mention routing、默认 worker、冲突响应和审计模型。

## Description

Extend channel binding to support M:1 — multiple workers sharing a single channel (e.g. one Lark group that has several workers, each with a different @handle). MVP is 1:N (a worker can bind many channels); this is the inverse case.

Scope:

- Channel-level router (not worker-level): incoming message mentioning `@worker-a` routes to Worker A's orchestrator, no mention routes to a default
- Shared channel credentials (one bot account, multiple worker consumers) vs per-worker credentials (each worker keeps its own)
- Name resolution: slug vs displayName vs mention-id
- Collision handling: same chat, simultaneous responses from two workers

## ActiveForm

Planning M:1 channel routing (deferred)

## Dependencies

- **blocked by**: REFACTOR-002
- **blocks**: (none)

## Notes

Current schema does not prevent this; the dashboard's channel binding UI just defaults to 1:N. When picked up, add a channel-level router service and a shared-credential store path.
