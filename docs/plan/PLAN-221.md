# PLAN-221 Worker Web session workspace surface

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **relatedTask**: REFACTOR-049

## Investigation

`apps/web/src/worker/api.ts` currently loads `projects`, `runs`, and
`runEvents`. `worker-studio.tsx` creates a project and immediately starts a run.
The UI hides import entrypoints, but several labels still say run and the
artifact rail filters artifacts through `runId`.

## Proposal

1. Rename Web API client data to workers/workspaces/sessions/turns/events.
2. Treat Soul selection as selecting a Soul worker.
3. Create a workspace/project row under that worker, then create a session turn
   with the selected capability.
4. Link artifacts/reviews through session/turn/invocation fields.
5. Update copy/tests to remove product-facing run language.
6. Preserve the current framework and Settings interaction completeness.

## Scope

In scope: `apps/web/src/worker/api.ts`, `worker-studio.tsx`, `i18n.ts`, and
focused Web tests.

Out of scope: CSS redesign beyond terminology/fit fixes and new routing.

## Verification

- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser flow screenshot after daemon boot.

## Status

Completed on 2026-05-10.

Delivered:

- Worker Web no longer calls `/api/local/runs`.
- The first screen uses Soul worker, workspace, session, turn, and artifact
  data from the new API contract.
- The create path creates a workspace and starts a session turn with the selected
  capability template.
- Settings copy no longer promises a built-in template runner fallback.

Verification:

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-api' test`
