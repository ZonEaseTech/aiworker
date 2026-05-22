# PLAN-396 Soul App scaffold micro-app defaults

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **relatedTask**: REFACTOR-088

## Current State

The active Host product contract says micro-app carries the mounted app-owned
UI/API boundary. `aiworker app create` still generates a starter manifest with
`ui.workbench`, a `host-descriptor` route, protocol action/search handlers and
broker-oriented sample text. `aiworker app smoke` also reports workbench
action/search status.

## Proposal

1. Update CLI tests first so scaffold output is expected to be micro-app-first
   and workbench/protocol/broker-free by default.
2. Change scaffold manifest generation to remove `ui.workbench` and make the
   starter route a micro-app surface.
3. Change the generated Host-mounted service to serve `/micro-app/routes/*`,
   `/micro-app/widgets/*`, `/api/briefs`, and `/api/briefs/search` as app-owned
   paths. Remove starter `/protocol/actions`, `/protocol/search`, `/broker/*`
   and host-descriptor route handlers.
4. Simplify app smoke output by removing workbench action/search checks.
5. Sync active docs and PMA/changelog.

## Scope

- `apps/cli/src/aiworker.ts`
- `apps/cli/src/aiworker.test.ts`
- `docs/cli.md`
- `docs/soul-app-developer.md`
- `docs/task/REFACTOR-088.md`
- `docs/plan/PLAN-396.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Non-Goals

- Do not remove the shared manifest `ui.workbench` schema in this slice.
- Do not remove official HR/QA compatibility descriptors in this slice.
- Do not redesign the generated starter app UI beyond changing the boundary
  defaults.

## Verification Plan

- CLI focused test and typecheck.
- Docs contract and whitespace checks.
- code-review-graph after code changes.

## Result

The CLI scaffold now defaults to micro-app mounted surfaces and app-owned
mounted API paths. Starter manifests no longer include `ui.workbench`, starter
mounted services no longer expose `/protocol/actions`, `/protocol/search`,
`/broker/*` or host-descriptor route handlers, and app smoke output no longer
contains workbench action/search fields.

## Verification

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run docs:check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
