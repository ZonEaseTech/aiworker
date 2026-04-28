# PLAN-028 OpenClaw-style worker session control plane

- **status**: implementing
- **createdAt**: 2026-04-28 12:22
- **approvedAt**: 2026-04-28 12:27
- **relatedTask**: FEAT-037
- **bkd**: ug03vh9v

## Current State

BUG-025 deliberately shipped the smallest release-safe fix:

1. Codex receives the worker history window instead of only the latest user
   message.
2. Gateway chat supports `/new` and `/reset`.
3. Reset closes the current open conversation and creates a fresh one.

This proves same-conversation continuity, but it does not solve long-session
memory. The current worker path still has structural gaps:

- `conversations(channel, chat_id, thread_id)` is both routing key and active
  session record. There is no explicit `sessionKey -> current sessionId` layer.
- `conversations.id` acts like an implicit session id, but old/new session
  lifecycle metadata is not represented beyond `status` and `closedAt`.
- `messages` is append-only, but prompt assembly is a fixed recent-message
  window (`maxHistoryMessages`, default 20), not token-aware.
- `conversations.summary` exists but no code writes it automatically.
- There is no compaction entry type, no memory-flush hook, no overflow retry,
  and no session context counters.
- Engine-native CLI session/thread ids are not stored in the worker session
  model. BUG-025 keeps correctness by rendering DB history, but it does not
  provide native resume.
- Reset is scoped to gateway chat. Idle/daily reset, cron isolation, and task
  session policy are not designed yet.

## OpenClaw Findings

OpenClaw's session architecture is a control plane, not just prompt replay:

1. The Gateway is the source of truth for session state.
2. A stable `sessionKey` identifies the logical bucket. The current
   `sessionId` points to the transcript that continues that bucket.
3. `/new` and `/reset` rotate `sessionId` for the same `sessionKey`.
4. Daily and idle expiry are evaluated on the next inbound message.
5. Session entries track last activity, model/auth overrides, token counters,
   compaction count, memory flush timestamps, delivery metadata, and CLI
   session bindings.
6. Transcripts are append-only and can contain normal messages, custom context,
   compaction summaries, branch summaries, and tool results.
7. Compaction keeps a summary plus recent messages; it also preserves tool-call
   and tool-result pairing.
8. Auto-compaction can trigger after overflow or when context usage approaches
   the model window.
9. Pre-compaction memory flush runs before compaction so durable memory can be
   written outside the transcript.
10. Native CLI session ids are stored as bindings, but reset clears or rotates
    them.

## Proposal

Introduce an AIWorker session control plane where worker.db is the authority and
engine-local state is only an optimization.

### 1. Session Store Layer

Add a `session_entries` table:

- `sessionKey` primary key.
- `currentConversationId` points to the open conversation for this key.
- lifecycle fields: `sessionStartedAt`, `lastInteractionAt`, `updatedAt`,
  `resetReason`, `resetAt`.
- routing metadata: `chatType`, `channel`, `accountId`, `peerId`, `threadId`,
  `displayName`.
- context metrics: `contextTokens`, `totalTokens`, `totalTokensFresh`,
  `compactionCount`, `memoryFlushAt`, `memoryFlushCompactionCount`.
- runtime overrides: model/provider/auth profile fields when needed.
- engine bindings JSON: provider id to native session/thread binding.

Keep `conversations.id` as the worker-side `sessionId`. Add:

- `sessionKey`
- `closedReason`
- optional `parentConversationId`
- optional context budget fields if they belong to the transcript rather than
  the session entry.

### 2. Session Key Resolver

Replace direct `(channel, chatId, threadId)` lookup with a resolver:

- gateway explicit `conversationId` -> `gw:conv:<id>`
- direct chat default policy -> configurable DM scope
- group/channel room -> isolated channel/group key
- thread/topic -> isolated thread key or parent fork policy
- cron -> fresh isolated run by default
- system events -> never rewrite user-facing delivery metadata

Configuration:

```ts
session: {
  dmScope: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer',
  identityLinks?: Record<string, string>,
  reset?: { mode: 'daily' | 'idle' | 'none', atHour?: number, idleMinutes?: number },
  resetByType?: { direct?: SessionResetPolicy, group?: SessionResetPolicy, thread?: SessionResetPolicy },
  resetByChannel?: Record<string, SessionResetPolicy>,
  resetTriggers?: string[],
}
```

Default should be decided explicitly. `per-channel-peer` is safer for
multi-user deployments; `main` gives the strongest single-user continuity.

### 3. Lifecycle and Reset

Resolve or create a session entry before classification:

1. Compute `sessionKey`.
2. Load the current session entry.
3. Evaluate manual reset, idle expiry, daily reset, and isolated-run policy.
4. If stale or reset, close the old conversation with a reason and create a new
   conversation for the same key.
5. Preserve user-selected toggles and model overrides where appropriate.
6. Clear context counters and engine bindings on explicit reset unless the
   binding policy says it can be safely reused.

Manual reset behavior:

- `/new` and `/reset` with no body should produce a short confirmation turn.
- `/new <model>` can be deferred unless model selection already has a stable
  catalog path.
- `/reset <prompt>` should run `<prompt>` as the first message in the fresh
  session.

### 4. Token-Budget Context Assembly

Replace fixed message-count prompt windows with token-budget assembly:

1. Resolve model context window from the executor variant catalog, with config
   override.
2. Reserve headroom for system prompt, tools, and expected output.
3. Include bootstrap/system prompt.
4. Include durable session summary or compaction messages.
5. Include recent messages up to `keepRecentTokens`.
6. Stop before budget; never blindly append all messages.

This directly addresses context overflow. A long multi-chat session should
compact and summarize; it should not either overflow or silently forget the
oldest content.

### 5. Compaction and Memory Flush

Add a `messages.kind` or equivalent side table for transcript entries:

- `message`
- `compaction`
- `task-marker`
- `memory-flush`
- `system-marker`

Compaction triggers:

- preflight threshold: `contextTokens > contextWindow - reserveTokens`
- overflow recovery: provider returns a known context-too-large error
- manual command/API later

Compaction output:

- a persisted compaction summary message
- updated `conversations.summary`
- updated session counters/checkpoints
- original raw messages retained for audit

Before compaction, run a no-delivery memory flush when enabled:

- directive asks the agent to write durable facts/decisions to project memory
  files.
- reply delivery is suppressed.
- flush runs once per compaction cycle.

### 6. Engine Bindings

Track native engine bindings per session entry:

- Codex app-server thread/conversation id when available.
- Claude Code session id when using native resume.
- Cursor session id when available.
- ACP session id if persistent ACP sessions are introduced.

Invariant: worker.db remains the authority. If a binding is stale, missing, or
auth-broken, the executor falls back to worker-rendered context and can mint a
new native binding. Reset clears or rotates bindings.

### 7. Observability

Expose status surfaces:

- gateway command `/status`
- CLI `aiworker sessions list`
- CLI `aiworker sessions inspect <sessionKey>`
- CLI `aiworker sessions reset <sessionKey>`
- worker API for UI

Show:

- sessionKey
- current conversation/session id
- last interaction
- reset policy and next expiry
- estimated context tokens / window / reserve
- compaction count
- memory flush status
- engine binding status

### 8. Maintenance

Add cleanup controls after the core path is stable:

- closed session retention by age/count
- orphan workspace cleanup
- optional archive of reset transcripts
- dry-run first, enforce later

## Staging

Do not implement this as one large patch.

## BKD Execution Chain

Coordinator: `ug03vh9v`.

Stage issues:

- S1-A — session schema and store primitives. Implemented directly on `main`
  as `c87851b` (`feat(session): add worker session store primitives`) after
  BKD attempts stalled or failed.
- S1-B `xuropmdt` — session resolver and lifecycle integration. Reviewed,
  merged, verified, and pushed to `origin/main` as `25cbb4f`
  (`merge(session): integrate S1-B resolver lifecycle (bkd/xuropmdt)`).
- S1-C `hpdbois1` — session lifecycle regression tests and docs. Adds
  regression coverage for the S1-B lifecycle surface without broadening into
  S2+ session features.
- S2 `u8dvdjh9` — token-budget context assembly.
- S3 `h4hpsxl2` — compaction and memory flush.
- S4 `aeea6hmf` — engine-native session bindings.
- S5 `u8hbsj4l` — session status and maintenance surfaces.

S1-C is unblocked because S1-B is on `origin/main` at `25cbb4f`. Each
subsequent issue starts after the previous issue reports to the coordinator and
its changes are reviewed, integrated, and focused verification passes.

Coordinator cron notes:

- `v544zrqo` / `FEAT-037-S1B-execute-poll` runs `issue-execute` against
  coordinator `ug03vh9v` every five minutes. It was used to keep S1-B moving
  while that stage was active.

Paused coordinator cron:

- `y20gqe0r` / `FEAT-037-S1B-poll` used `issue-follow-up`, which queued behind
  `review` status and could not reliably advance the chain.

Abandoned issues:

- `gf1grhpz` was a stale-base S1-A attempt and must not be merged.
- `isf4t4f5` was a stalled clean-base S1-A attempt and must not be merged.
- `h5w2u2qx` failed due agent quota with no usable changes and must not be
  merged.

Stage 1: session key/store/lifecycle

- S1-A added the `session_entries` schema, migration, and store primitives.
- S1-B integrated the resolver/lifecycle path: stable `sessionKey`,
  `session_entries.currentConversationId`, legacy open-conversation backfill,
  account-scoped keys, threaded route isolation, gateway manual reset, and
  classifier new-topic rotation.
- S1-C locks the implemented Stage 1 behavior with focused regression tests and
  updates this plan/task documentation.
- Idle and daily expiry remain later lifecycle work. They are not implemented in
  S1-B/S1-C and should not be implied by Stage 1 docs or tests.

Stage 2: token-budget prompt assembly

- S2 `u8dvdjh9` implements token estimation and budget-aware context assembly.
- Token budgeting is enabled by `orchestrator.contextWindowTokens`,
  `reserveTokens`, or `keepRecentTokens`. Without those fields, the previous
  `maxHistoryMessages` fixed-window behavior remains the safe fallback.
- The context builder keeps the system/bootstrap prompt first, keeps
  conversation summary in that system prompt, selects recent history
  newest-backward until the token budget is filled, and returns selected
  history oldest-to-newest.
- Executor variant context-window hints and explicit orchestrator overrides are
  used when resolving the effective budget; an 8k conservative fallback remains
  available for unknown models.
- `session_entries.contextTokens` is updated from the assembled prompt with the
  deterministic estimator.
- Covered by tests for token-budget capping, recent-message preference,
  chronological order, summary/system prompt preservation, custom budget
  tuning, context token recording, and legacy `maxHistoryMessages` fallback.
- Not included in S2: compaction summaries, memory flush, overflow retry,
  native engine bindings, CLI/API/UI status surfaces, expiry policy, or
  maintenance cleanup.

Stage 3: compaction and memory flush

- Add compaction entries and summary writer.
- Add overflow-retry path.
- Add no-delivery memory flush hook.

Stage 4: engine native bindings

- Persist and reuse engine bindings where supported.
- Make stale binding recovery explicit.
- Keep DB-rendered context as fallback.

Stage 5: status, cleanup, UI follow-up

- Add CLI/API surfaces.
- Add maintenance dry-run.
- Add worker UI observability later.

## Risks

- Fixed-window history hides overflow by forgetting. Token-budget compaction is
  required before claiming true long memory.
- `dmScope=main` can leak context between users. It is only safe for single-user
  deployments.
- Native CLI resume can become stale after auth changes. Treat bindings as
  disposable, not authoritative.
- Compaction can lose operational detail if tool-call/result pairs are split.
  Boundary logic must keep them together.
- Memory flush is agentic write behavior and needs no-delivery safeguards plus
  rollback/audit.
- Schema migration touches core routing. Stage 1 must keep a compatibility path
  for existing `conversations(channel, chat_id, thread_id)` rows.

## Alternatives

1. Keep BUG-025 prompt rendering only.
   - Simpler, already shipped.
   - Rejected as full solution because it either overflows or forgets.
2. Rely entirely on Codex/Claude native sessions.
   - Efficient when available.
   - Rejected as authority because native state is provider-local and can break
     on auth, cache, or host migration.
3. Store summaries only in `conversations.summary`.
   - Low schema cost.
   - Insufficient because multiple compaction checkpoints and memory flush state
     need structured tracking.

## Execution Gate

This plan was approved on 2026-04-28 12:27 and is executing through the staged
BKD chain above. Stage workers should report to the coordinator and move their
own issue to review; the overall FEAT-037 task remains in progress until the
later stages land.
