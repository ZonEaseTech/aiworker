# PLAN-393 Component retirement docs and skill feedback

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **relatedTask**: REFACTOR-085

## Current State

`packages/component` has been removed from the active workspace. Some active
guidance still has a prohibition-oriented shape, while README still listed the
old package in the repository structure.

## Proposal

Update only active AIWorker-owned guidance:

1. Remove the old package line from `README.md`.
2. Rewrite the UI section in `AGENTS.md` as a positive workflow:
   `packages/ui` preflight, app-local ownership reason, and `ui:check`.
3. Rewrite `aiworker-host-dev` UI guidance and completion checklist around the
   same positive path.
4. Add Soul App authoring guidance for official app web surfaces to compose
   `packages/ui` primitives.
5. Update `scripts/check-doc-contract.ts` to assert the positive guidance.

## Out Of Scope

- No edits to `pma-web` or `shadcn` skills.
- No rewrites of historical PMA, changelog or Superpowers records.
- No product code changes.

## Verification Plan

- `bun run docs:check`
- `git diff --check`

## Completion Notes

Implemented the adjusted scope requested by the user:

- Did not modify `pma-web` or `shadcn` skills.
- Rewrote project-owned UI guidance in a positive style: how to use
  `packages/ui`, how to classify app-local UI, and how to verify with
  `bun run ui:check`.
- Removed the stale `component/` repository structure entry from `README.md`.
- Added Soul App authoring guidance for official app web surfaces.
- Updated docs contract checks to guard the positive guidance.

Verification passed with `bun run docs:check` and targeted `git diff --check`.
