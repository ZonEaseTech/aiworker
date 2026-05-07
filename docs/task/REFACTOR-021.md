# REFACTOR-021 Runtime Brain Memory search context

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 11:06
- **claimedAt**: 2026-05-07 11:06
- **completedAt**: 2026-05-07 11:10
- **plan**: PLAN-154
- **sourceObjective**: Continue the lightweight Project Brain direction by
  executing selected `memory_search` capability decisions and injecting bounded
  scoped memory snippets into the executor context.
- **relatesTo**: REFACTOR-020, PLAN-153, docs/architecture.md,
  docs/governance-node-status.md

## Context

REFACTOR-020 made `load_skill` a real runtime path. The next production gap is
`memory_search`: capability selection can request long-term memory, and
filesystem/cloud Brain providers already expose `searchMemories(query)`, but
the orchestrator does not yet load matched Project Brain memories into the
turn prompt.

## Scope

- Add bounded memory search helpers to `ContextManager`.
- Inject selected memory snippets into the system prompt when `memory_search`
  is selected.
- Preserve loaded memory context across context-overflow retry.
- Extend capability decision telemetry with loaded memory ids/count and search
  errors.
- Update architecture/governance docs to mark `memory_search` as implemented.
- Add focused orchestrator tests for memory search prompt injection.

## Out of Scope

- No vector store or embedding index.
- No executor-native memory/tool implementation.
- No gateway/fleet/Web UI changes.
- No admission materializer expansion beyond existing memory-add behavior.

## Acceptance Criteria

1. When intent requires `memory_search`, the orchestrator calls
   `BrainProvider.searchMemories()` with the inbound turn text.
2. Matched memories are injected into the executor system prompt with bounded
   count and body length.
3. Capability decision events report loaded memory ids/count and search errors.
4. Turns without `memory_search` keep the current lightweight behavior.
5. Focused core tests and production gates pass.

## Notes

- 2026-05-07 11:06: Task opened after REFACTOR-020 completed `load_skill` and
  left `memory_search` as the next observe-only runtime gap.
- 2026-05-07 11:10: Completed. `memory_search` now runs before executor
  dispatch when selected, matched memory snippets are bounded and injected into
  the system prompt, and capability decisions report loaded memory
  ids/count/errors.

## Validation

- 2026-05-07 11:07:
  `bun run --filter '@zonease/aiworker-core' test src/worker/orchestrator/service.history.test.ts src/worker/orchestrator/decisions.test.ts src/worker/orchestrator/capabilities.test.ts`
  passed.
- 2026-05-07 11:07:
  `bun run --filter '@zonease/aiworker-core' typecheck` passed.
- 2026-05-07 11:08: `bun run check` passed.
- 2026-05-07 11:10: `bun run test` passed.
- 2026-05-07 11:10: `bun run build` passed.
