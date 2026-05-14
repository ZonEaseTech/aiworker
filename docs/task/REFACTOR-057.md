# REFACTOR-057 Worker-scoped API and CLI surface

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **claimedAt**: 2026-05-11 01:16
- **completedAt**: 2026-05-11 01:26
- **plan**: PLAN-234
- **relatesTo**: apps/api, apps/cli, packages/shared, docs/architecture.md

## Background

The target HTTP and CLI contracts in `docs/architecture.md` are worker-scoped,
but the implementation still exposes flat workspace/session routes and CLI
commands that select workers through `--soul`.

## Goal

Make worker-scoped API and CLI commands the canonical surface for creating and
managing workers, workspaces, and sessions.

## Acceptance Criteria

- API supports `POST/PATCH /api/local/workers` and worker-scoped workspace and
  session routes.
- Flat workspace/session routes are removed or kept only where required by
  existing implementation internals; product callers use worker-scoped routes.
- CLI supports `worker create|list|show|select`, `workspace create|list|show
  --worker`, and `session create|list|show|message --worker`.
- OpenAPI docs and tests reflect the worker-scoped contract.

## Resolution

- Added explicit local worker create/update API routes.
- Added worker-scoped templates, workspace, session, message, file, and artifact
  routes while keeping old flat routes available during Web migration.
- Changed daemon bootstrap so it hydrates persisted workers but does not seed all
  built-in Souls automatically.
- Updated CLI init/doctor to avoid worker auto-creation.
- Added `worker create|show|select` and moved workspace/session/file/artifact
  commands to explicit worker ids or worker inference from rows.

## Verification

- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
