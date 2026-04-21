# FEAT-003 Telegram channel adapter

- **status**: pending
- **priority**: P2
- **owner**: (unassigned)
- **createdAt**: 2026-04-21 07:30

## Description

Implement the full Telegram channel adapter behind the stub landed in REFACTOR-002 / PLAN-003.

Scope:

- Webhook signature verification (`X-Telegram-Bot-Api-Secret-Token`)
- Event normalisation to internal `Envelope` (private chat, group, supergroup, channel)
- Outbound reply via Telegram Bot API (`sendMessage`, `sendPhoto`, `sendDocument`)
- Long-message chunking, Markdown V2 escaping
- Adapter contract test using a recorded real webhook payload

## ActiveForm

Planning Telegram channel adapter (deferred)

## Dependencies

- **blocked by**: REFACTOR-002
- **blocks**: (none)

## Notes

Stub adapter with `NotImplementedError` lands in PLAN-003 Phase 7 so the channels registry is complete. This task finishes the implementation.
