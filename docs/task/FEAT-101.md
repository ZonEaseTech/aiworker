# FEAT-101 Shared UI component governance gate

- **status**: completed
- **priority**: P1
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-372
- **relatesTo**: FEAT-099, REFACTOR-083, BUG-138

## Background

AIWorker now has a shared Host/Soul component package at
`packages/component`, including primitives, patterns, package-owned styles, a
component catalog, and a migration queue. Agents can still drift into local
app CSS because the lower-friction path is often to copy nearby `className`
markup instead of checking the shared package first.

The UI rule already exists in `AGENTS.md`, but it needs an operational gate:
frontend proposals should record the shared component preflight, and local
development checks should fail on obvious newly-added app-local button/card/chip
style clones when a shared primitive or pattern should be considered first.

## Acceptance Criteria

- Host Web / Soul App UI instructions require a component-library preflight in
  non-trivial proposals.
- The preflight names checked `packages/component` primitives or patterns, and
  records any app-local exception or migration-queue entry.
- `packages/component/src/catalog.ts` exposes the governance expectation beside
  the component catalog and migration queue.
- A lightweight script checks changed Web UI files for obvious local component
  clones and points agents back to `packages/component`.
- The script is reachable from root scripts and included in the regular lint
  gate.
- PMA docs and changelog record the governance change.
- Focused verification and code-review-graph review run before completion.

## Notes

- This task is a development-process guardrail, not a UI redesign.
- It must not touch Host/Soul protocol behavior, HR profile semantics, or the
  currently in-progress HR composer implementation.

## Completion

Implemented shared UI component governance as an active development gate:

- `AGENTS.md` now requires a `Component Library Preflight` for non-trivial Host
  Web and Soul App UI proposals.
- `.agents/skills/aiworker-host-dev/SKILL.md` now routes Host Web/shared UI
  work through the same preflight and `bun run ui:check` verification.
- `packages/component/src/catalog.ts` now exposes
  `componentGovernanceRules` beside the catalog and migration queue.
- `scripts/check-web-ui-components.ts` scans changed Web UI files for obvious
  local component clones, raw native select/dialog usage, and unscoped shared
  selector overrides.
- Root `lint` now includes `bun run ui:check`, and `docs:check` verifies the
  gate stays wired.

Verification completed:

- `bun scripts/check-web-ui-components.ts`
- `bun run ui:check`
- `bun run docs:check`
- `bunx tsc --noEmit -p scripts/tsconfig.json`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-component' test src/catalog.test.ts`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
