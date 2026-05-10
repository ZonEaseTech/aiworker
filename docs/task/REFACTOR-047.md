# REFACTOR-047 Worker session data contract

- **status**: in_progress
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **claimedAt**: 2026-05-10 18:01
- **plan**: PLAN-219
- **relatesTo**: GOALS.md, docs/architecture.md, packages/shared, packages/storage-sqlite, packages/core

## Background

The current greenfield worker loop still exposes `project -> run -> run_event`
as the dominant implementation contract. This conflicts with the approved
architecture: one host daemon owns many Soul workers, a worker owns
workspaces/projects, and the external engine is handed a workspace session. A
technical engine call may be audited as `engine_invocation`, but `run` must not
remain a product or API object.

## Goal

Replace the local worker data/runtime contract with workers, workspaces,
sessions, turns, engine invocations, session events, and artifacts linked to the
session/turn chain. Remove `run` and `run_event` from the greenfield worker
schema, shared types, and core runtime naming.

## Acceptance Criteria

- Storage schema and generated worker migration contain no `runs` or
  `run_events` tables.
- Shared local workspace types expose worker/workspace/session/turn/invocation
  terminology.
- Core runtime initializes Soul workers, creates workspaces, starts sessions,
  records turns, invokes an external engine adapter, and registers artifacts.
- Default local execution no longer uses the template runner.
- Focused shared/storage/core tests are updated and pass.
- PMA docs and changelog are synchronized.

## Evidence

Pending.
