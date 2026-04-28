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

## Stage Progress

- S1-A completed directly on `main` as `c87851b`
  (`feat(session): add worker session store primitives`), adding the
  `session_entries` migration and store helpers.
- S1-B was reviewed, merged, verified, and pushed to `origin/main` as
  `25cbb4f`
  (`merge(session): integrate S1-B resolver lifecycle (bkd/xuropmdt)`).
- S1-C (`hpdbois1`) covers Stage 1 lifecycle regressions for gateway
  conversation continuity, first-turn session entry creation, active session
  mapping reuse, legacy conversation backfill, account-scoped keys, threaded
  route isolation, gateway `/new` and `/reset` manual rotation, and
  classifier-driven new-topic rotation.
- S2 (`u8dvdjh9`) implements token-budget context assembly only: a deterministic
  estimator, budget-enabled recent-history selection, model/config budget
  resolution, `session_entries.contextTokens` updates, config validation, and
  focused tests. Legacy `maxHistoryMessages` remains the fallback when no token
  budget field is configured.
- S3 (`h4hpsxl2`) implements opt-in persistent compaction and pre-compaction
  memory flush without a schema migration: compaction and memory-flush audit
  rows are stored in `messages.richMetadata`, cumulative summaries are written
  to `conversations.summary`, raw transcript rows remain for audit,
  `session_entries.compactionCount` / memory-flush checkpoints are updated,
  and context-overflow errors force one compaction retry.

Deferred to later stages:

- Idle and daily expiry policy implementation.
- Engine-native session/thread bindings.
- CLI/API/UI session status and maintenance surfaces.
