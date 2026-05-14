# PLAN-234 Worker-scoped API and CLI surface

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 01:11
- **approvedAt**: 2026-05-11 01:11
- **completedAt**: 2026-05-11 01:26
- **relatedTask**: REFACTOR-057

## Current State

- API exposes worker list/show and worker workspace create, but lacks worker
  create/update.
- Workspace/session routes are mostly flat after the workspace id.
- CLI supports `worker list`, but workspace/session commands still use `--soul`.

## Proposal

1. Add local daemon worker create/update routes.
2. Add worker-scoped template, workspace, session, event, message, and file
   routes as the canonical API.
3. Update CLI commands to use `--worker` and add worker create/show/select.
4. Update OpenAPI route docs and focused API/CLI tests.

## Scope

- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/aiworker.test.ts`
- shared request/response types if needed

## Verification Plan

- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## Implementation

- Added explicit worker creation/update to the local daemon API.
- Added worker-scoped canonical routes for templates, workspaces, sessions,
  messages, files, and artifacts.
- Switched CLI bootstrap/init semantics away from auto-seeding all available
  Souls.
- Added CLI worker create/show/select and explicit `--worker` workspace/session
  commands.

## Verification Results

- Passed: `bun run --filter '@zonease/aiworker-api' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-api' test`
- Passed: `bun run --filter '@zonease/aiworker-cli' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-cli' test`
