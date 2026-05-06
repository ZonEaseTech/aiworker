# TODO-036 Add cross chat-id isolation coverage to Governance Kernel harness

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-07 00:04
- **claimedAt**: 2026-05-07 00:04
- **completedAt**: 2026-05-07 00:30
- **plan**: PLAN-144
- **relatesTo**: QA-009, QA-010, QA-011, QA-013, QA-014, QA-015, PLAN-127, PLAN-133, BUG-086, PLAN-145

## Description

`docs/governance-node-status.md` still lists multi-conversation isolation across
`chat-id` boundaries inside one worker as a residual risk. The current harness
proves same-`chat-id` continuity, but it does not actively create a second
`chat-id` inside the same worker and assert that the second conversation remains
separate from the primary conversation.

This gap weakens the lightweight Brain direction because worker session
isolation is a governance invariant. It should be proven by source-backed
evidence, not inferred from the session router design.

## ActiveForm

Add source-backed cross `chat-id` isolation checks to the Governance Kernel
regression harness.

## Dependencies

- **blocked by**: none
- **blocks**: reducing worker governance residual risk
- **relates to**: QA-015 long-running REST multi-turn evidence

## Evidence

- `scripts/governance-kernel-harness.ts` currently asserts one conversation row
  for the primary `chatId`.
- It does not create a second `chatId` in the same worker project.
- `docs/governance-node-status.md` explicitly records this as a non-claim.

## Expected Behavior

For each harness pair, after the primary multi-turn chat succeeds, the harness
should run one extra turn under a distinct `chat-id` and assert via `worker.db`
that:

- the primary `chat-id` still maps to exactly one conversation;
- the alternate `chat-id` maps to exactly one separate conversation;
- the two conversation ids are different;
- the alternate conversation has persisted user/assistant messages.

## Non-Scope

- Do not change orchestrator routing behavior unless the new check exposes a
  real bug.
- Do not involve fleet or gateway.
- Do not add Brain domain logic.
- Do not change executor adapters.

## Resolution

`scripts/governance-kernel-harness.ts` now runs one extra turn per compact/full
pair with a distinct alternate `chat-id`. The harness then queries `worker.db`
for the primary and alternate `chat-id` values and asserts:

- primary and alternate `chat-id` each map to exactly one conversation;
- the two conversation ids are different;
- the alternate turn finished and persisted user/assistant messages;
- all SQLite evidence queries exit successfully.

The first post-change source run also exposed BUG-086: the Claude Code default
profile was forcing a volatile model alias. That was fixed under PLAN-145; the
final source compact run passed both executors.

## Validation

- `bun scripts/governance-kernel-harness.ts --help` PASS.
- `bun run lint` PASS.
- `bun run typecheck` PASS.
- `bun run test` PASS.
- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts --mode worker-source-local --matrix compact --debug-root tmp/governance-kernel-plan144-source-3 --port-base 19680 --timeout-ms 180000` PASS:
  - overall PASS;
  - 2 compact pairs × 35 checks = 70 PASS / 0 FAIL;
  - `developer-codex cross chat-id isolation DB` PASS;
  - `general-assistant-claude-code cross chat-id isolation DB` PASS.
