# TODO-026 `aiworker init` "alternates" recommendation list is advisory but not enforced — define the contract

- **status**: pending
- **priority**: P3
- **owner**:
- **createdAt**: 2026-05-05 14:18
- **discoveredAt**: 2026-05-05 13:55

## Context

`aiworker init --soul <preset>` prints a "Recommended for Soul X" hint with
an `alternates: ...` list. Examples observed during 0.8.0 validation:

- `developer`: `claude-code (alternates: codex)`
- `hr-recruiting`: `claude-code (alternates: mcp)`
- `finance-ops`: `claude-code (alternates: mcp)`
- `qa-reviewer`: `claude-code (alternates: mcp)`

In practice, `aiworker executor select --engine codex --apply` succeeds
on `finance-ops` (which lists alternates as `mcp`, not `codex`) without
warning or error. The end-to-end run produced a working codex-backed
`finance-ops` worker.

So the `alternates` list is **advisory only**, but it is rendered as
authoritative-looking text. Operators reasonably read it as the supported
matrix.

## Decision Needed

Two consistent paths:

1. **Advisory only** (current de-facto behaviour):
   - Re-word the line:
     `Suggested for Soul X: claude-code (also tested: mcp). Other engines
      are technically supported but not specifically validated for this Soul.`
   - Document this in `docs/executor-engines.md` and `docs/architecture.md`.

2. **Enforced matrix**:
   - `executor select` warns (or errors with `--force`) when picking an
     engine that is not in the recommended/alternates list for the Soul.
   - Update Soul presets so the alternates list is exhaustive of validated
     pairings.
   - Add a per-(Soul, engine) compatibility test.

Either is fine; mixing the two is the current state and produces operator
confusion.

## Acceptance Criteria

1. Pick one path and document it.
2. Update `aiworker init` and `executor select` UX accordingly.
3. Update `docs/executor-engines.md` to make the contract explicit.
