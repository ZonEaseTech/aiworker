# PLAN-220 Local daemon worker/session API

- **status**: implementing
- **owner**: local
- **createdAt**: 2026-05-10 18:01
- **relatedTask**: REFACTOR-048

## Investigation

`apps/api/src/modes/worker.ts` still owns one `state.runtime`, one
`soul-worker`, and one `soul-workspace`. Its OpenAPI path list includes
`/api/local/runs`, `/api/local/runs/{id}`, cancellation, and run events.
Settings defaults include `workspace-template`, an internal template runner.

## Proposal

1. Replace singleton runtime state with a registry keyed by worker id.
2. Seed one available Soul worker per available built-in vertical Soul.
3. Add worker/workspace/session/turn routes.
4. Keep settings as host daemon settings.
5. Remove public run routes and OpenAPI descriptions.
6. Keep engine invocation/event access only as internal timeline data.

## Scope

In scope: local daemon API bootstrap, route tests, engine scan/test defaults,
and OpenAPI route list.

Out of scope: Web presentation changes and CLI command UX.

## Verification

- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-api' typecheck`

## Status

Implementing.
