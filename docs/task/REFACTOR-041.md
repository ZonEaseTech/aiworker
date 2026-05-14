# REFACTOR-041 Vertical Soul Web IA

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 10:30
- **claimedAt**: 2026-05-10 10:30
- **completedAt**: 2026-05-10 10:46
- **plan**: PLAN-208
- **relatesTo**: apps/web, local worker API, vertical Soul workspace MVP

## Background

Worker Web still carried the wrong default center: import/design/work-order
language had to be replaced with a vertical Soul workspace first screen.

## Goal

Make the first viewport a Soul catalog and case workspace for HR, PM, QA, and
DevOps. Remove import entrypoints entirely. The primary path is:

```text
Soul -> skill / capability template -> case / run -> business artifact
```

## Acceptance Criteria

- No Import ZIP / Import file / Import Claude Design entrypoint remains.
- First screen is Soul catalog, not developer dashboard or work order center.
- HR, PM, QA, and DevOps are visible and selectable.
- Selecting a Soul shows only that Soul's skills/templates.
- Creating a case and run is visible from the selected Soul/template context.
- Artifact/review surfaces use business artifact language.

## Evidence

- Worker Web first screen is now Soul catalog + scoped capability templates +
  case/run/artifact surface.
- Browser validation created HR, PM, QA, and DevOps cases/runs and confirmed
  artifacts are scoped to the selected Soul.
- No Import / Open Design / Nexu / work-order entrypoint remains in the Web
  product surface; tests assert these terms are absent.
- Full gate evidence is recorded in QA-026.
