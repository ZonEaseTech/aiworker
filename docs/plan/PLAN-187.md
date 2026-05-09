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
