# PLAN-372 Shared UI component governance gate

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: FEAT-101

## Current State

`packages/component` already exports shared primitives and patterns such as
`Button`, `IconButton`, `Select`, `Textarea`, `SettingsShell`,
`StudioCollapsibleGroup`, `ProgressCard`, `MessageFlow`, and
`ProfileReaderShell`. The package also keeps `componentCatalog` and
`componentMigrationQueue` in `packages/component/src/catalog.ts`.

The active agent guide says new Host Web and Soul App UI should prefer the
shared package, but that requirement is mostly text. Agents still tend to follow
nearby app-local markup and CSS because there is no focused preflight checklist
or development gate that makes the shared package the lower-friction path.

## Proposal

Turn the existing shared-component preference into an operational rule:

1. Add a required component-library preflight to Host Web / Soul App UI
   instructions. Non-trivial proposals must list checked shared primitives or
   patterns and explain any app-local exception.
2. Keep the component catalog as the shared inventory and make the migration
   queue the place to record reusable gaps.
3. Add a lightweight root script that scans changed Web UI files for obvious
   app-local component clones, raw native select/dialog usage, and shared
   selector overrides.
4. Wire the script into root `lint` through a dedicated `ui:check` script.

## Component Library Preflight

- Checked primitives/patterns:
  `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Switch`, `Field`,
  `Dialog`, `ActionCard`, `SettingsShell`, `StudioCollapsibleGroup`,
  `StudioPill`, `ProgressCard`, `MessageFlow`, `ProfileReaderShell`,
  `ArtifactPreviewFrame`, and `ReviewPanelShell`.
- Local UI exceptions:
  this plan does not add new user-facing app-local UI; it adds documentation and
  a guard script. Existing app-local HR and Worker Web surfaces remain owned by
  their current PMA tasks.
- Reusable gaps:
  development-time enforcement was missing. The new script becomes the gate,
  and future reusable UI gaps should be added to
  `componentMigrationQueue` before local CSS grows.

## Scope

- `AGENTS.md`
- `.agents/skills/aiworker-host-dev/SKILL.md`
- `packages/component/src/catalog.ts`
- `packages/component/src/catalog.test.ts`
- `scripts/check-web-ui-components.ts`
- `scripts/check-doc-contract.ts`
- `package.json`
- PMA task, plan, and changelog files

## Non-Goals

- No migration of current HR composer code.
- No broad cleanup of legacy app-local CSS.
- No Host/Soul protocol, manifest, storage, broker, or profile behavior change.
- No release or commit automation in this slice.

## Risks

- A full-tree scan would fail on known legacy/local UI debt and block unrelated
  work. Mitigation: the first gate scans changed files by default and uses the
  catalog/migration queue as guidance.
- A weak check could become noisy instead of useful. Mitigation: focus on
  obvious clone indicators: raw native select/dialog usage, generic button/card
  clone classes, and app-local overrides of shared selectors.
- Agents may bypass the rule if it only lives in code. Mitigation: duplicate
  the rule in AGENTS, Host skill workflow, catalog metadata, and lint.

## Implementation Plan

1. Record PMA task/plan state and append index entries.
2. Add the Host Web / Soul App component preflight requirement to active agent
   instructions and Host development skill.
3. Add component catalog governance metadata and tests.
4. Implement `scripts/check-web-ui-components.ts` and wire it through
   `ui:check` and `lint`.
5. Update doc contract checks and changelog.
6. Run focused script tests, component tests, root lint/doc checks, diff check,
   and code-review-graph.

## Verification

- [x] `bun scripts/check-web-ui-components.ts`
- [x] `bun run ui:check`
- [x] `bun run docs:check`
- [x] `bunx tsc --noEmit -p scripts/tsconfig.json`
- [x] `bun run --filter '@zonease/aiworker-component' typecheck`
- [x] `bun run --filter '@zonease/aiworker-component' test src/catalog.test.ts`
- [x] `bun run lint`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Result

The shared UI component preference is now enforced in three places:

- active agent instructions and Host development skill require the proposal
  preflight;
- `packages/component/src/catalog.ts` keeps the governance rule discoverable
  with the shared catalog and migration queue;
- root lint runs `ui:check`, which scans changed Web UI files and rejects
  obvious app-local clones unless the file imports the shared component package,
  has a migration queue entry, or documents a local exception.

`crg:review` exited 0 with risk score `0.40`. Its remaining static test-gap
labels included unrelated in-progress worktree symbols (`bootstrapWorkerApp`,
`HrProfileToolsPanel`) and the catalog `rule`; direct catalog test coverage was
added for the governance rule.
