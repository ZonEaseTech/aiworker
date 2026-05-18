# PLAN-367 Host/Soul shared component library

- **status**: approved
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: FEAT-099

## Current State

The approved design is
`docs/superpowers/specs/2026-05-19-aiworker-component-library-design.md`.
`packages/component` exports React primitives and patterns, but styles are not
package-owned and there is no complete catalog or Host/Soul consumption proof.

The implementation plan is
`docs/superpowers/plans/2026-05-19-aiworker-component-library.md`.

## Proposal

Make `packages/component` the shared Host/Soul Web component library. Move
shared styles and tokens into the package, export a style entrypoint, add a
component catalog, migrate reusable Host Web and HR workbench UI into generic
components, and prove a Soul App Web surface imports the package directly.

## Scope

- `AGENTS.md`
- `packages/component`
- `apps/web`
- `apps/aiworker-hr/product/web`
- `docs/task/FEAT-099.md`
- `docs/plan/PLAN-367.md`
- `docs/changelog.md`
- focused tests and browser verification

## Non-Goals

- No Host/Soul protocol or manifest schema change.
- No HR/QA domain semantics in `packages/component`.
- No shadcn copy-registry model.
- No blind removal of app-local CSS before visual/build checks pass.

## CRG Candidate Baseline

CRG baseline was rebuilt before implementation:

- `bun run crg:update`: passed.
- `bun run crg:build`: passed.
- `bun run crg:status`: built on branch `codex/aiworker-component-library` at
  commit `71c1aa5278aa`.
- `bun run crg:review`: passed with `No changes detected`.

Initial reusable UI candidates were recorded in
`tmp/component-library-crg-candidates.md`.

## Verification

- Pending: `bun run crg:update`
- Pending: `bun run crg:build`
- Pending: `bun run crg:review`
- Pending: `bun run --filter '@zonease/aiworker-component' test`
- Pending: `bun run --filter '@zonease/aiworker-component' typecheck`
- Pending: `bun run --filter '@zonease/aiworker-web' test`
- Pending: `bun run --filter '@zonease/aiworker-web' typecheck`
- Pending: `bun run --filter '@zonease/aiworker-web' lint`
- Pending: `bun run --filter '@zonease/aiworker-web' build`
- Pending: `bun run web:smoke:mounted-surfaces`
- Pending: Browser smoke for Host Web
- Pending: Browser smoke for Soul App proof surface
- Pending: `git diff --check`
