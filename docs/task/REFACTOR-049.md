# REFACTOR-049 Worker Web session workspace surface

- **status**: in_progress
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **claimedAt**: 2026-05-10 18:01
- **plan**: PLAN-221
- **relatesTo**: apps/web

## Background

Worker Web has the right high-level visual frame, but its data contract and copy
still say project run in several places. The first screen must select a Soul
worker, then create or enter a workspace/project, create a session, submit a
turn, and inspect the artifact.

## Goal

Update the Worker Web data layer and product language from runs/cases to
workers/workspaces/sessions/turns/artifacts while preserving the approved visual
framework.

## Acceptance Criteria

- First screen is a Soul worker workspace, not a dashboard, developer tool, or
  Open Design copy.
- User can choose HR/PM/QA/DevOps worker, choose a capability template, create a
  workspace/session turn, and see an artifact.
- Web uses session/turn endpoints and no `/api/local/runs` calls.
- Settings remains explicit button-open, persists changes, rescans/tests real
  engines, and has no Open Design/Nexu/design-generation language.
- Focused Web tests and build pass.

## Evidence

Pending.
