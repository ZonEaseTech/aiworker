# PLAN-187 Lessons Queue batch review

- **status**: pending
- **owner**: unassigned
- **createdAt**: 2026-05-09 05:55
- **task**: FEAT-057

## Context

Brain Inbox can create pending admission proposals from lesson candidates, but
operators need a product surface for batch review and rejection to avoid
high-frequency memory prompts.

## Proposal

Add Lessons Queue as a product-facing projection over pending admission proposals
created from case lesson candidates.

## Scope

- List/filter lesson candidates by risk/status/source case.
- Batch reject and batch approve/apply where safe.
- Keep canonical Brain writes behind existing admission state machine.

## Risks

- Batch apply can make memory pollution faster if review metadata is weak.
- High-risk lessons must not be silently applied.

## Verification

- Admission state machine tests remain authoritative.
- Focused Lessons Queue tests for batch reject/apply constraints.

## Notes

- 2026-05-09 06:45：本轮未实现批量 approve/apply。当前 Case 面板只提供 per-case
  `lessons propose`，后续仍走既有 Brain admission 状态机逐条 approve/reject/apply。
  这避免在 dogfood 之前把高风险 lesson 批量写入做得过早。
