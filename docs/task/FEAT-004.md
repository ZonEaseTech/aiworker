# FEAT-004 Lark channel adapter

- **status**: pending
- **priority**: P2
- **owner**: (unassigned)
- **createdAt**: 2026-04-21 07:30

## Description

Implement the full Lark (飞书) channel adapter behind the stub landed in REFACTOR-002 / PLAN-003.

Scope:

- Encrypted event subscription (AES decrypt + verify_token)
- Event normalisation to internal `Envelope` (p2p, group)
- Outbound reply via Lark Open Platform API (text + interactive card messages)
- App-level vs tenant-level token handling, auto-refresh
- Card template selector (first reply may be interactive card, follow-ups text)
- Adapter contract test using a recorded real event payload

## ActiveForm

Planning Lark channel adapter (deferred)

## Dependencies

- **blocked by**: REFACTOR-002
- **blocks**: (none)

## Notes

Stub adapter with `NotImplementedError` lands in PLAN-003 Phase 7. This task finishes the implementation.
