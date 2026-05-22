# PLAN-392 Remove legacy component package

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-21
- **approvedAt**: 2026-05-21
- **completedAt**: 2026-05-21
- **relatedTask**: REFACTOR-084

## Current State

Investigation found no live app/package imports of
`@zonease/aiworker-component`. Remaining references are:

- `packages/component` itself and the `bun.lock` workspace entry.
- `scripts/check-web-ui-components.ts`, which still names the legacy package,
  has migration-queue plumbing, and scans `packages/component/src`.
- `scripts/check-doc-contract.ts`, which asserts the older phrase
  `packages/component` is legacy migration debt.
- Active architecture and root agent guidance that still describe
  `packages/component` as a migration-phase legacy layer.
- Proof tests that assert HR/QA product web source does not contain
  `@zonease/aiworker-component`; these remain useful as no-reintroduction
  checks.
- Historical docs under `docs/task`, `docs/plan`, `docs/changelog.md` and
  `docs/superpowers`; these are audit records and should not be rewritten.

## Proposal

Remove the component package as an active workspace, not merely as an import
target.

1. Delete `packages/component`.
2. Regenerate `bun.lock` so the `packages/component` workspace package and
   `@zonease/aiworker-component` alias disappear.
3. Simplify `scripts/check-web-ui-components.ts`:
   - keep detection of forbidden `@zonease/aiworker-component` imports;
   - remove migration-queue output and `packages/component/src` scanning;
   - update failure text to say the package has been retired and imports must
     move to `packages/ui`.
4. Update the UI governance script tests to expect zero legacy-package wording
   and the current no-reintroduction guard.
5. Update active docs and instructions:
   - `AGENTS.md`
   - `docs/architecture.md`
   - `.agents/skills/aiworker-host-dev/SKILL.md`
   - `scripts/check-doc-contract.ts`
6. Leave historical PMA/Superpowers/changelog references intact.

## Component Library Preflight

- Checked `packages/ui`: active shadcn-managed shared UI package with
  primitives, theme globals, icons and `SessionComposer`.
- Checked current consumers: Host Web and official Soul App web import
  `@zonease/aiworker-ui` directly.
- Checked `packages/component`: no live consumer remains outside its own
  package files.
- The removal does not add app-local primitives or CSS. It removes the old
  target and keeps `packages/ui` as the only shared UI destination.

## Risks

- `bun.lock` may retain stale workspace entries if it is not regenerated.
- UI governance could become weaker if legacy detection is removed rather than
  converted into a no-reintroduction guard.
- Historical docs contain many references to `packages/component`; rewriting
  them would make the audit trail misleading and noisy.
- The current worktree already contains the completed SessionComposer
  consolidation changes, so removal should avoid touching unrelated CLI/docs
  work.

## Scope

- Remove `packages/component/**`.
- Update root package graph lockfile.
- Update UI governance script and tests.
- Update active architecture / agent / skill guidance.
- Update PMA and changelog records for this removal.

## Verification Plan

- `rg "@zonease/aiworker-component|packages/component" apps packages scripts AGENTS.md docs/architecture.md .agents/skills/aiworker-host-dev/SKILL.md`
- `bun install --lockfile-only`
- `bun test scripts/check-web-ui-components.test.ts`
- `bun scripts/check-web-ui-components.ts --all --audit`
- `bun run docs:check`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run crg:update`
- `bun run crg:review`

## Completion Notes

The legacy component workspace was removed:

- Deleted `packages/component/**`.
- Regenerated `bun.lock`; the `packages/component` workspace package and
  `@zonease/aiworker-component` alias are gone.
- Removed migration-queue handling and `packages/component/src` scanning from
  `scripts/check-web-ui-components.ts`.
- Kept a centralized no-reintroduction guard for
  `@zonease/aiworker-component` imports and stylesheets, with a regression test.
- Updated active architecture, AGENTS and Host developer skill guidance so
  `packages/ui` is the only shared UI target.
- Preserved historical PMA/Superpowers/changelog references as audit trail.

Focused tests, UI governance, docs contract, workspace typecheck, Web build,
diff whitespace check and CRG review passed. Root `bun run lint` remains blocked
by broader current repo lint debt unrelated to deleting `packages/component`;
focused ESLint on the touched files has no errors.
