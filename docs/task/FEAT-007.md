# FEAT-007 M:1 channel routing (multiple workers, one chat)

- **status**: pending
- **priority**: P3
- **owner**: (unassigned)
- **createdAt**: 2026-04-21 07:30

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
