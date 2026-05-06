# PLAN-144 Governance harness cross chat-id isolation coverage

- **status**: completed
- **createdAt**: 2026-05-07 00:04
- **approvedAt**: 2026-05-07 00:04
- **completedAt**: 2026-05-07 00:30
- **relatedTask**: TODO-036

## Current State

The lightweight Brain direction is now anchored in `docs/architecture.md`:
Brain hard logic owns governance invariants while LLM/executor owns semantics.
The worker conformance evidence is strong for admission, truthfulness,
tool-call observability, Soul matrix coverage, and long-running REST multi-turn
continuity.

One residual risk remains cheap and high-value to close next:
`docs/governance-node-status.md` says multi-conversation isolation across
`chat-id` boundaries inside one worker is not asserted by a dedicated check.
The harness currently validates continuity for one `chatId`, but not isolation
between two chat ids in the same worker.

## Proposal

Add one extra harness turn per pair using a distinct alternate `chat-id`. Then
query `worker.db` to assert:

1. primary `chat-id` has exactly one conversation;
2. alternate `chat-id` has exactly one conversation;
3. the conversation ids differ;
4. alternate conversation message count is at least two.

This adds evidence without adding Brain semantic logic. It makes the worker
governance boundary more verifiable rather than making Brain heavier.

## Risks

1. The harness becomes one executor turn longer per pair.
2. Real executor environments may surface unrelated availability failures; the
   source change should still be covered by typecheck/lint/help locally.
3. The check should rely on DB state, not on the executor's natural-language
   claim about isolation.

## Scope

- `scripts/governance-kernel-harness.ts`
- `docs/governance-node-status.md`
- PMA task/plan/changelog/index

## Non-Scope

- No fleet/gateway changes.
- No admission materializer changes.
- No orchestrator routing change unless the harness reveals a failing
  invariant.
- No release.

## Validation

1. `bun run typecheck`
2. `bun run lint`
3. `bun scripts/governance-kernel-harness.ts --help`

## Progress

- 2026-05-07 00:04: Created TODO-036 / PLAN-144 and started harness coverage.
- 2026-05-07 00:17: Source compact run proved the new Codex-side check but
  surfaced a separate Claude Code default model projection failure. Split that
  into BUG-086 / PLAN-145.
- 2026-05-07 00:30: Final source compact run passed: 2 compact pairs × 35
  checks = 70 PASS / 0 FAIL, including both cross `chat-id` isolation DB
  checks. Repository lint, typecheck, and full test also passed.
