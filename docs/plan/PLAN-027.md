# PLAN-027 Codex session continuity and reset controls

- **status**: completed
- **createdAt**: 2026-04-28 11:42
- **approvedAt**: 2026-04-28 11:42
- **completedAt**: 2026-04-28 11:51
- **relatedTask**: BUG-025
- **bkd**: 60cvzz94
- **releaseTarget**: `@zonease/aiworker-cli@0.4.2`

## Current State

The gateway-to-worker chat path is healthy: `chat.send` reaches the local
worker, worker events stream back through the gateway, and the same
`conversationId` hint maps to the same worker conversation.

The failing layer is Codex execution. `Orchestrator.run()` loads the worker
history window from `messages`, but `CodexExecutor` discards all prior messages,
starts a fresh app-server thread every turn, and sends only the latest user
message. A two-turn e2e check against the test fleet proved this: the worker
persisted the first turn's memory key, but the second turn did not receive it.

OpenClaw's relevant design is:

1. Route inbound messages to a stable session key.
2. Reuse the current session id for that key until reset/expiry.
3. `/new` and `/reset` rotate the session id for the same key.
4. Keep the visible transcript as the user-facing source of truth, while native
   Codex/CLI thread bindings are an implementation detail.

## Proposal

1. Make Codex turns receive the full worker history window, rendered as a single
   structured prompt for both legacy `newTurn` and current `turn/start`.
2. Keep worker.db as the authority for conversation history. Native Codex thread
   resume can be added later, but correctness must not depend on Codex-side
   cache state.
3. Add gateway chat reset triggers: `/new` and `/reset` close the currently open
   worker conversation for the same `conversationId` key and create a fresh one.
4. Strip optional reset command bodies so `/reset <prompt>` starts a fresh
   conversation and runs `<prompt>` as the first user turn.
5. Add focused tests for Codex prompt history and orchestrator reset behavior.
6. Rebuild and rerun the test-server fleet to local Codex worker memory e2e,
   including a reset check.

## Risks

- Rendering history into one prompt is less native than Codex app-server thread
  resume, but it is deterministic, works for both protocol variants, and keeps
  worker.db authoritative.
- Reset triggers are initially scoped to gateway chat only. Channel adapters can
  adopt the same raw marker later if needed.
- Exact `/new` or `/reset` still consumes one Codex turn to acknowledge the new
  session. This is acceptable for the current test phase.

## Scope

In scope:

- Codex executor prompt construction from `AgentRunInput.messages`.
- Gateway chat `/new` and `/reset` parsing.
- Orchestrator reset handling for gateway-marked reset envelopes.
- Focused unit tests and real fleet/local-worker e2e.

Out of scope:

- Full PLAN-021 dmScope/sessionKey schema work.
- Auto-compaction and memory flush.
- Native Codex thread binding persistence in worker.db.
- Cross-channel identity linking.

## Implementation

- Rendered the full `AgentRunInput.messages` history window into a structured
  Codex prompt with role-tagged blocks. Both legacy `newTurn` and current
  `turn/start` now receive that prompt instead of only the latest user message.
- Added optional trace capture to the Codex test fixture so tests can assert the
  actual JSON-RPC request payload.
- Added `/new` and `/reset` parsing in gateway `chat.send`. A reset command
  strips its optional body and marks the envelope with a gateway-only raw reset
  flag.
- Added orchestrator reset handling that closes the current open conversation
  for the same chat key, schedules its workspace disposal, and creates a fresh
  conversation before persisting the reset body.

## Verification

- Focused tests passed:
  `bun test packages/core/src/worker/executor/engines/codex/executor.test.ts packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun run typecheck` passed.
- `bun run lint` passed.
- `bun run test` passed.
- `bun run build` passed.
- CLI publish dry-run packed the expected 23 files for `0.4.2` and stopped at
  missing authentication.
- npm registry check confirmed `@zonease/aiworker-cli@0.4.2` is not published
  yet.
- Real e2e passed with the test-server fleet and a local Codex worker after the
  final build:
  - first turn stored `MEMKEY-PLAN027B-CERULEAN`;
  - second turn with the same `conversationId` returned that key;
  - `/reset ...` on the same `conversationId` returned `UNKNOWN`;
  - worker.db had two conversations for the same chat key: old closed, new open.
