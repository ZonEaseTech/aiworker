# REFACTOR-048 Local daemon worker/session API

- **status**: in_progress
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **claimedAt**: 2026-05-10 18:01
- **plan**: PLAN-220
- **relatesTo**: apps/api, packages/core, packages/storage-sqlite

## Background

The local daemon currently bootstraps one singleton runtime and publicly exposes
`/api/local/projects` and `/api/local/runs`. That makes Soul a project metadata
field instead of the worker boundary and keeps `run` in the product API.

## Goal

Expose the local daemon as `1 host -> 1 daemon -> N Soul workers` with
workspace/session/turn endpoints. Remove public run endpoints.

## Acceptance Criteria

- Daemon bootstraps available HR/PM/QA/DevOps workers in `worker.db`.
- API exposes workers, worker workspaces, sessions, turns, artifacts, reviews,
  lessons, files, events, and settings.
- API no longer documents or serves `/api/local/runs`.
- Engine scan/test does not include the old internal template runner.
- Focused API tests pass.

## Evidence

Pending.
