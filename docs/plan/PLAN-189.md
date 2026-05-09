# PLAN-189 Dogfood falsification and release readiness

- **status**: pending
- **owner**: unassigned
- **createdAt**: 2026-05-09 05:55
- **task**: FEAT-057

## Context

The goal is to prove the operating surface works in practice, not just that the
routes compile. Release readiness must include source, packaged CLI, and harness
evidence.

## Proposal

Run a dogfood campaign against aiworker itself:

1. create several real worker tasks;
2. inspect Case Files instead of raw Journal;
3. verify Review Decision can drive operator action within minutes;
4. propose/reject/apply lessons;
5. rerun at least one case;
6. publish a minor/patch release only after source and packaged validation pass.

## Scope

- QA task recording evidence.
- Release task if package changes justify publication.
- No 1.0 GA claim unless release criteria are fully met.

## Risks

- If Case File does not reduce review effort, the pivot is weak and should not
  expand to vertical workers.
- Published package validation can fail due executor environment, so source and
  packaged evidence must be distinguished.

## Verification

- `bun run check`
- `bun run test`
- `bun run build`
- `bun publish --dry-run --access public`
- published package smoke
- compact governance harness
