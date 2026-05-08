# PLAN-178 Brain Inbox lesson admission flow

- **status**: draft
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

AIWorker supports Brain admission materialization for memory and Brain skills,
but lesson candidates from task outcomes are not yet presented as a deliberate
Brain Inbox product surface.

## Goal

Create a Brain Inbox flow that turns selected task lessons into reviewable
admission proposals without silently writing long-term memory.

## Scope

- Define lesson candidate types:
  - repo fact;
  - architecture decision;
  - build/release procedure;
  - recurring failure pattern;
  - executor reliability note;
  - Brain skill improvement.
- Extract candidates from Brain Engine review and Journal evidence.
- Show candidate source, scope, risk, expiry/retention, confidence, target file,
  and rollback plan.
- Bridge approved candidates into existing Brain admission.
- Keep candidate review batch-friendly and low interruption.

## Non-Goals

- No automatic canonical memory write.
- No general vector memory system.
- No cross-scope memory promotion.

## Acceptance Criteria

1. A completed task can produce zero or more Brain Inbox candidates.
2. Each candidate has evidence refs, scope, risk, expiry/retention, and rollback.
3. Operator can approve/apply through the existing admission path.
4. Rejected candidates do not alter canonical Brain.

## Verification

- Focused admission/inbox tests.
- One dogfood sample generating a developer repo lesson candidate.
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-174, PLAN-176
- **blocks**: PLAN-180, PLAN-181
