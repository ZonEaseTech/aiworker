# PLAN-163 README product positioning clarity

- **status**: completed
- **createdAt**: 2026-05-07 23:36
- **approvedAt**: 2026-05-07 23:36
- **completedAt**: 2026-05-07 23:36
- **relatedTask**: TODO-039

## Current State

README currently explains the Project Brain / Worker / Gateway topology, but
the product reason is implicit. A reader can still mistake AIWorker for a
replacement executor or a better single-session assistant.

## Proposal

Add an early positioning section before the architecture diagram in both
README languages:

1. Say when not to use AIWorker.
2. State that AIWorker wraps existing executors as governed business workers.
3. Name the durable Project Brain, governed self-iteration, BYO executor
   boundary, and Worker/Fleet operations as the competitive surface.

## Scope

- `README.md`
- `README.zh-CN.md`
- `docs/task/TODO-039.md`
- `docs/plan/PLAN-163.md`
- Task/plan index and changelog.

## Verification

- `git diff --check`

## Progress

- 2026-05-07 23:36: README positioning section added in English and Chinese.
