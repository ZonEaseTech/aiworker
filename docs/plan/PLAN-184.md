# PLAN-184 BrainCaseService projection

- **status**: pending
- **owner**: unassigned
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
