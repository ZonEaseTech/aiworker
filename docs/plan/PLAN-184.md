# PLAN-184 BrainCaseService projection

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 05:55
- **task**: FEAT-057

## Context

`BrainJournalService.getTaskTrace()` is the existing source for task trace,
Gate verdict, messages, tool events, lineage, and authority warnings. Case File
should wrap that trace into an operator-facing object without changing the raw
Journal data model.

## Proposal

Add `BrainCaseService` under core. It should:

- list recent case summaries from `agent_tasks`;
- read a single Case File by task id;
- derive Review Decision from Gate verdict;
- derive evidence/risk/lesson summaries from Journal events;
- preserve sensitive redaction defaults.

## Scope

- Core service and exports.
- Focused unit tests using seeded worker.db rows.
- No DB schema change.

## Risks

- Derived summaries can hide useful evidence if too aggressive.
- Case list must stay cheap and avoid loading large transcripts by default.

## Verification

- Core tests for list + show.
- Existing Journal tests still pass.

## Notes

- 2026-05-09 06:05：进入 implementing。实现约束是不改 DB schema，仅从
  `BrainJournalService` 和 worker-owned task rows 派生 Case File。
- 2026-05-09 06:32：`BrainCaseService` 已实现 list/show 投影，覆盖 Review Decision、
  outcome、evidence、risk、lineage 和 lesson candidates。聚焦 core 测试通过。
