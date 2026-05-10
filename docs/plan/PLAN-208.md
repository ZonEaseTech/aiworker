# PLAN-208 Vertical Soul Web IA

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 10:30
- **completedAt**: 2026-05-10 10:46
- **relatedTask**: REFACTOR-041

## Current State

The previous Worker Web surface was still downstream of a half-finished
Open-Design-inspired shell and did not make vertical Souls the first product
decision.

## Proposal

Rebuild Worker Web around a compact but complete local workspace:

1. Left rail Soul catalog with HR, PM, QA, DevOps available and future domains
   disabled.
2. Main skill/template selection scoped by selected Soul.
3. Case creation form that immediately starts a run.
4. Case/artifact/review panels that expose business artifact output rather than
   developer work-order language.
5. Explicit Settings button; no default modal.

## Implementation Status

Completed. Worker Web now starts from Soul catalog, shows scoped templates,
creates case/run from the selected template, removes import entrypoints, and
keeps artifact/review rail scoped to the selected Soul.

Verification is recorded in QA-026.
