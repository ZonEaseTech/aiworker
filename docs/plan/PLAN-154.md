# PLAN-154 Runtime Brain Memory search context

- **status**: completed
- **createdAt**: 2026-05-07 11:06
- **approvedAt**: 2026-05-07 11:06
- **completedAt**: 2026-05-07 11:10
- **relatedTask**: REFACTOR-021

## Current State

1. `BrainProvider.searchMemories(query)` already exists in the shared provider
   contract.
2. Filesystem and multi-source Brain providers can return matched memory
   records.
3. `CapabilityRegistry` advertises `memory_search`, and intent classification
   selects it for research/memory-related turns.
4. The orchestrator currently emits the capability decision but does not load
   matched memory snippets into the executor prompt.

## Proposal

1. Add `ContextManager.searchMemories()` to execute provider search with a
   bounded result count and per-memory body limit.
2. Add an explicit `Loaded brain memories` prompt section that states these are
   Project Brain filesystem/cloud memory snippets, not executor-native tools.
3. Wire orchestrator service so selected `memory_search` executes before
   executor dispatch and is reused on context-overflow retry.
4. Extend capability decision payloads with loaded memory ids/count and search
   errors.
5. Update focused tests and architecture/status docs.

## Risks

1. Prompt bloat from broad memory matches. Mitigation: cap result count and
   content length.
2. Weak matching quality from current filesystem substring search. Mitigation:
   keep implementation truthful and bounded; vector/semantic ranking remains a
   future provider improvement.
3. False observability claim. Mitigation: mark enforced only when memory or
   skill bodies are actually injected, and expose errors explicitly.

## Scope

- `packages/core/src/worker/orchestrator/context-manager.ts`
- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/orchestrator/decisions.ts`
- `packages/core/src/worker/orchestrator/capabilities.ts`
- `packages/core/src/worker/orchestrator/service.history.test.ts`
- architecture/status/changelog/PMA docs

## Non-Scope

- Vector memory indexing.
- Executor-native memory tools.
- Brain admission materializer expansion.
- Fleet/gateway/Web UI changes.

## Validation

- 2026-05-07 11:07:
  `bun run --filter '@zonease/aiworker-core' test src/worker/orchestrator/service.history.test.ts src/worker/orchestrator/decisions.test.ts src/worker/orchestrator/capabilities.test.ts`
  passed.
- 2026-05-07 11:07:
  `bun run --filter '@zonease/aiworker-core' typecheck` passed.
- 2026-05-07 11:08: `bun run check` passed.
- 2026-05-07 11:10: `bun run test` passed.
- 2026-05-07 11:10: `bun run build` passed.

## Progress

- 2026-05-07 11:06: Investigation completed and implementation started under
  the user-approved production-readiness direction.
- 2026-05-07 11:10: Implemented and validated. `memory_search` is now an
  executed Brain context loader; remaining production work should focus on
  broader runtime release hardening and non-memory admission materializers.
