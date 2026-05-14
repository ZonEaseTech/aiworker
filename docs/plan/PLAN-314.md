# PLAN-314 Agent-operational documentation contract

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 13:39
- **relatedTask**: DOC-013

## Decision

Implement the agent-operational documentation model:

- `docs/architecture.md` owns hard constraints through a stable Constraint
  Registry.
- `AGENTS.md`, README and skills are thin routers or execution guides.
- PMA, changelog and Superpowers records are audit trail only.
- A docs contract check protects active entrypoints from stale or duplicated
  architecture routes.

## Investigation

- Active entrypoints are now small enough to maintain, but constraints are still
  repeated across architecture, AGENTS, README, Soul App authoring docs and both
  route skills.
- `README.zh-CN.md` is stale and still describes older turn/durable-memory and
  embedded-runtime concepts.
- `docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are large
  by design. They should remain audit records, not current contracts.
- Existing machine gates cover code boundaries through lint and
  `scripts/check-soul-app-boundaries.ts`; there is no equivalent gate for the
  active documentation contract.

## Implementation Slices

1. Create PMA and Superpowers implementation tracking.
2. Add `docs/architecture.md#Constraint Registry`.
3. Adjust thin layers and skills so they route to registry IDs instead of
   becoming separate contracts.
4. Replace stale `README.zh-CN.md` with a pointer to canonical active docs.
5. Add `scripts/check-doc-contract.ts`, expose `docs:check`, and include it in
   root `lint`.
6. Verify, close PMA, update changelog and commit.

## Verification Plan

- Run `bun run docs:check`.
- Run `bun run lint`.
- Run `git diff --check`.
- Run code-review-graph because a TypeScript script changes.

## Result

Completed.

The active documentation model now has an explicit maintenance split:

- `docs/architecture.md#constraint-registry` is the normative constraint source.
- `AGENTS.md`, README files and route skills are thin routing/execution layers.
- `docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are
  audit trail and cannot override the active contract.
- `scripts/check-doc-contract.ts` validates the active docs contract and runs
  through `bun run docs:check` and root `bun run lint`.

Verification:

- `bun run docs:check`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
