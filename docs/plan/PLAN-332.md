# PLAN-332 Soul App MCP Client And Server Contract

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-16
- **relatedTask**: FEAT-091
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-mcp-client-server-contract.md

## Decision

Implement Phase 4 of Soul App authoring layout v2 by making MCP client config a
runtime projection target and MCP server declarations an app manifest contract.

## Scope

- Add shared manifest validation for generic MCP server package names.
- Add Codex and Claude Code MCP client projection adapters.
- Pass manifest `engineAssets` and selected worker engine target into workspace
  projection.
- Update runtime tests and Soul App authoring docs.

## Out Of Scope

- Scaffold v2 migration.
- Real MCP server package implementation.
- Engine-global MCP config mutation.
- Secret management or engine login automation.

## Verification

- `bun test packages/shared/src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Started after Phase 3 commit `b0117447`.
- 2026-05-16: Completed with shared manifest tests, core runtime tests, core
  package tests, soul-app-runtime tests, lint, diff check and CRG passing.
