# REFACTOR-039 Worker Web Open Design source parity

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 00:31
- **claimedAt**: 2026-05-10 00:31
- **plan**: PLAN-205
- **completedAt**: 2026-05-10 01:43
- **relatesTo**: REFACTOR-038, PLAN-204, apps/web, Open Design source

## Background

User review rejected the Worker Web studio because the home screen still exposed
internal lifecycle surfaces: review, run events, lessons, and artifact canvas.
User then clarified that screenshots are only visual evidence and that the
implementation should directly read and mirror the Open Design source. This
slice therefore treats Open Design's `EntryView`, `NewProjectPanel`,
`DesignsTab`, `PetRail`, `SettingsDialog`, and `index.css` selector system as
the baseline instead of adapting the previous Worker Web studio.

## Goal

Rebuild the Worker Web first screen as a direct Open Design source-parity
baseline:

```text
Open Design entry shell -> new project panel -> designs grid -> pet rail -> settings dialog
```

AIWorker semantics are intentionally minimal in this slice. The point is to
remove the dashboard/review/admin frame completely and establish the exact OD
interaction skeleton for later product-specific refinement.

## Acceptance Criteria

- Home screen no longer has Review, Lessons, Run events, or Artifact canvas as
  primary regions.
- Layout uses Open Design source-aligned class names and structure: left
  creation panel, center project browser, right pet rail, and first-run
  settings dialog.
- Create action maps to the local worker API without introducing old admin
  shell concepts.
- Recent project cards are derived from local briefs/runs and can be searched.
- Focused Web tests, build, browser review, and CRG are recorded before
  completion.

## Progress

- 2026-05-10 00:31: Claimed after user supplied the Open Design home reference
  screenshot and explicitly called out the mismatch.
- 2026-05-10 01:43: Replaced the Worker Web studio with an Open Design
  source-parity shell, including OD assets, entry/new-project/design-grid/pet
  rail/settings selector structure, and guards against review/lessons/canvas
  returning to the first screen.

## Evidence

- `bun run --filter '@zonease/aiworker-web' test` passed.
- `bun run --filter '@zonease/aiworker-web' typecheck` passed.
- `bun run --filter '@zonease/aiworker-web' lint` passed.
- `bun run --filter '@zonease/aiworker-web' build` passed, including studio CSS
  selector checks.
- `bun run check`, `bun run test`, `git diff --check`, package-level API build,
  and CLI bundle passed.
- Browser review opened `http://127.0.0.1:5173/worker/`, verified the settings
  dialog and home at 1280px and 2048px, and found 0 console errors.
- CRG review reported 0 affected flows, 18 test gaps, and risk score 0.55.
