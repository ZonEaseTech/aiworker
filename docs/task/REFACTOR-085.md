# REFACTOR-085 Feed component retirement guidance back into active docs

- **status**: completed
- **priority**: P1
- **owner**: codex
- **createdAt**: 2026-05-21
- **claimedAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **plan**: PLAN-393
- **relatesTo**: REFACTOR-084, UI-001, packages/ui, aiworker-host-dev, aiworker-soul-app-dev

## Background

`REFACTOR-084` removed the legacy component workspace package. Follow-up
guidance should teach the current path:

- use `packages/ui` as the shared UI source;
- compose shadcn-managed primitives in Host Web and official Soul App web;
- keep app-owned UI local when it is domain-specific;
- run the existing UI governance gate for non-trivial UI changes.

The guidance should stay positive and procedural instead of growing a long list
of historical prohibitions. Third-party or generic skills such as `pma-web` and
`shadcn` are maintained by their authors and are out of scope for this
project-local feedback pass.

## Acceptance Criteria

1. Active docs and AIWorker-owned skills describe how to use `packages/ui` as
   the shared UI path.
2. The guidance uses positive workflow language instead of repeating retired
   package warnings.
3. `pma-web` and `shadcn` skill files are not modified.
4. `scripts/check-doc-contract.ts` checks the positive guidance in active docs.
5. Historical PMA, changelog and Superpowers audit records are left unchanged.

## Verification

- `bun run docs:check`
- `git diff --check`

## Resolution

Updated active AIWorker-owned guidance after the component package removal:

- `README.md` now lists `packages/ui` as the shared UI package without the old
  component workspace entry.
- `AGENTS.md` describes the positive UI workflow: check `packages/ui`, decide
  app-local UI ownership, and run `bun run ui:check`.
- `aiworker-host-dev` now frames Component Library Preflight around checked
  `packages/ui` primitives, ownership reason and UI governance evidence.
- `aiworker-soul-app-dev` and `docs/soul-app-developer.md` now guide official
  Soul App web surfaces to compose shared controls from `packages/ui` while
  keeping domain semantics in the owning app.
- `scripts/check-doc-contract.ts` asserts the positive guidance.

`pma-web` and `shadcn` skills were left untouched.
