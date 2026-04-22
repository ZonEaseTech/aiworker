# FEAT-005 WhatsApp channel adapter (Meta Cloud API)

- **status**: completed
- **priority**: P2
- **owner**: bkd-worktree (PLAN-006)
- **createdAt**: 2026-04-21 07:30
- **claimedAt**: 2026-04-21 18:55
- **completedAt**: 2026-04-22 04:07
- **plan**: PLAN-006

## Description

Implement the full WhatsApp channel adapter behind the stub landed in REFACTOR-002 / PLAN-003, targeting the Meta Cloud API (not the older on-prem WhatsApp Business API).

Scope:

- Webhook signature verification (`X-Hub-Signature-256` HMAC-SHA256)
- Webhook verification challenge on initial subscription
- Event normalisation (text, image, audio, document, interactive replies, reactions)
- Outbound reply via Meta Graph API (messages endpoint, media endpoint for attachments)
- Message template handling (24-hour session window + approved templates)
- Adapter contract test using a recorded real webhook payload

## ActiveForm

Planning WhatsApp channel adapter (deferred)

## Dependencies

- **blocked by**: REFACTOR-002
- **blocks**: (none)

## Notes

Stub adapter with `NotImplementedError` lands in PLAN-003 Phase 7. This task finishes the implementation.
