# FEAT-037 OpenClaw-style worker session control plane

- **status**: in_progress
- **priority**: P1
- **owner**: Codex
- **createdAt**: 2026-04-28 12:22
- **claimedAt**: 2026-04-28 12:27
- **plan**: PLAN-028
- **bkd**: ug03vh9v

## Description

BUG-025 fixed a narrow release blocker: Codex now sees the worker history window
for a single open gateway conversation, and `/new` / `/reset` can rotate that
conversation. That is not a complete OpenClaw-style session system.

AIWorker needs a session control plane that can keep long-running worker
conversations coherent without overflowing model context, while still allowing
operators and users to start fresh sessions deliberately.

OpenClaw research anchors:

- Official session overview: session routing, DM scope, reset triggers, daily
  and idle lifecycle, and gateway-owned state.
- Official session/compaction deep dive: `sessionKey -> sessionId`, mutable
  session store, append-only transcript, context counters, compaction,
  pre-compaction memory flush, maintenance, and status surfaces.
- Source entries inspected:
  - `src/auto-reply/reply/session.ts`
  - `src/config/sessions/types.ts`
  - `src/config/sessions/session-key.ts`
  - `src/config/sessions/reset.ts`
  - `src/agents/cli-session.ts`

## Acceptance Criteria

1. Worker session identity is explicit: a stable `sessionKey` maps to a current
   `sessionId` / conversation, and reset creates a new session id for the same
   key.
2. Session routing supports gateway conversation hints plus channel-derived
   keys with configurable DM isolation.
3. Session lifecycle supports manual reset, idle expiry, daily reset, and
   isolated cron/task modes without mutating unrelated chat sessions.
4. Context assembly is token-budget aware and cannot grow unbounded across many
   chats.
5. Long conversations use persistent compaction summaries plus recent messages,
   not a fixed message-count truncation that silently forgets old context.
6. A pre-compaction memory-flush hook can write durable memory before old
   transcript sections are summarized.
7. Engine-native session/thread bindings are stored as optimization only;
   worker.db remains the correctness authority.
8. Status and diagnostics expose session key, active session id, context usage,
   compaction count, reset reason, and engine binding state.
9. Migration and tests cover existing BUG-025 behavior, reset, expiry,
   compaction, overflow retry, and stale engine binding recovery.

## Dependencies

- **blocked by**: none
- **relates to**: FEAT-031, PLAN-021, BUG-025
- **blocks**: robust long-memory worker operation and future per-channel
  session UX

## Notes

- Multiple chats will overflow or forget under the current partial fix:
  `orchestrator.maxHistoryMessages` bounds the prompt by message count, not
  tokens, and `conversations.summary` exists but is not automatically written.
- `conversations.id` can become the worker-side `sessionId`; the missing layer
  is a store/table that maps `sessionKey` to the active conversation plus
  lifecycle, budget, and engine-binding metadata.
- The first implementation should be staged. Do not combine schema migration,
  compaction, native engine resume, UI, and cleanup into one work session.
