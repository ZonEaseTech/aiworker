# PLAN-333 Soul App Host Adapter Layout Migration

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-16
- **relatedTask**: FEAT-090
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-host-adapter-layout-migration.md

## Decision

Implement Phase 3 of Soul App authoring layout v2 by moving official HR and QA
Host adapter code from `src/` into `host-adapter/`.

## Scope

- Move app definition, protocol handler re-exports, API entry, mounted service
  and standalone service files.
- Move official app tests next to the adapter code.
- Update manifest refs, package exports/scripts and shared fixtures.
- Update active authoring docs.

## Out Of Scope

- Product layout changes.
- MCP client/server support.
- Runtime protocol behavior changes.

## Verification

- `bun test packages/shared/src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Started after Phase 2 checkpoint.
- 2026-05-16: Completed with HR/QA tests, validate, typecheck, lint, diff check
  and code-review-graph self-review passing.
