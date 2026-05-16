# PLAN-333 Soul App Scaffold And Legacy Layout Removal

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-16
- **relatedTask**: FEAT-092
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-scaffold-legacy-removal.md

## Decision

Implement Phase 5 by making CLI scaffold and validation converge on the v2 Soul
App authoring layout.

## Scope

- Move generated scaffold files to `engine-assets/`, `product/` and
  `host-adapter/`.
- Update generated manifest refs, package scripts and tsconfig include.
- Update CLI tests for scaffold, validate, smoke, private import and raw Web
  Storage checks.
- Refresh active authoring docs.

## Out Of Scope

- Historical PMA/spec rewrites.
- Official app layout changes.
- Real MCP server package implementation.

## Verification

- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Started after Phase 4 commit `4bc1a3ac`.
- 2026-05-16: Implemented scaffold v2 layout, manifest refs, package scripts,
  validator scans, active docs, and SDK/runtime/publish test examples.
- 2026-05-16: Closed after focused tests, typecheck, bundle build, lint,
  diff check, and code-review-graph review passed.
