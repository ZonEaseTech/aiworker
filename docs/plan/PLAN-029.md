# PLAN-029 Gateway chat accepted id continuation

- **status**: completed
- **createdAt**: 2026-04-28 18:54
- **approvedAt**: 2026-04-28 18:57
- **relatedTask**: BUG-027

## Context

Investigation traced `chat.send` across the operator CLI, gateway forwarder,
worker gateway-client dispatcher, orchestrator session resolver, and gateway
event subscriber.

Current behavior:

1. `aiworker chat` omits `conversationId` unless `--conversation-id` is passed.
2. `packages/gateway/src/router/dispatch.ts` validates and forwards
   `chat.send`; it does not rewrite chat ids.
3. `packages/core/src/worker/gateway-client/dispatcher.ts` creates
   `gw:<workerId>:<uuid>` when the hint is omitted.
4. The same dispatcher wraps every provided hint as `gw:conv:<hint>`.
5. Reusing a returned id therefore changes `gw:<workerId>:<uuid>` into
   `gw:conv:gw:<workerId>:<uuid>`, which produces a different worker session
   key and loses Codex native session continuity.
6. Gateway event frames are built in
   `packages/core/src/worker/gateway-client/subscriber.ts` from worker bus
   payloads. Those payloads currently expose internal `conversations.id`, so
   the streamed `conversationId` does not match the accepted gateway id.

Existing tests already cover explicit hints and `/new` reset behavior in
`packages/core/src/worker/gateway-client/dispatcher.test.ts`. There is no
regression for omitted `conversationId` followed by reusing the accepted id.

## Proposal

1. Normalize gateway chat ids in
   `packages/core/src/worker/gateway-client/dispatcher.ts`:
   - omitted hint still creates `gw:<workerId>:<uuid>`;
   - hints with the reserved `gw:` prefix are treated as already-normalized and
     are reused unchanged;
   - non-prefixed explicit hints keep the existing `gw:conv:<hint>` behavior.
2. Preserve the internal worker `conversationId` on `WorkerEventBus`, but add a
   `gatewayConversationId` field for gateway-origin envelopes in
   `packages/core/src/worker/orchestrator/service.ts`.
3. Make `packages/core/src/worker/gateway-client/subscriber.ts` prefer
   `gatewayConversationId` when filling gateway event payload
   `conversationId`; fall back to the internal id for non-gateway events.
4. Add focused regressions:
   - omitted first `chat.send` returns a `gw:` id and reusing it keeps the same
     ingested `chatId`;
   - explicit first `chat.send` can reuse its accepted `gw:conv:` id unchanged;
   - gateway-origin orchestrator events carry `gatewayConversationId`;
   - subscriber maps gateway-origin events to the accepted gateway id.

## Risks

- Treating `gw:` as a reserved prefix means user-supplied explicit ids that
  start with `gw:` will no longer be wrapped. That is consistent with accepting
  gateway-returned ids as opaque reusable ids.
- Event payload `conversationId` becomes user-facing for gateway-origin chat,
  while the worker bus still keeps the internal id. Consumers needing internal
  ids should read local bus payloads or worker session APIs rather than gateway
  stream payloads.
- No database migration is required.

## Scope

Expected code changes are limited to:

- `packages/core/src/worker/gateway-client/dispatcher.ts`
- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/gateway-client/subscriber.ts`
- focused tests beside those modules

Verification:

- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun test packages/core/src/worker/gateway-client/subscriber-refresh.test.ts`
- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`

The live test-server fleet to local Codex worker smoke remains an external
operator verification because it needs the deployed gateway and real Codex CLI.

## Alternatives

1. Only stop double-wrapping `gw:` ids. This is the smallest patch, but it
   leaves accepted ids and streamed event ids incoherent.
2. Return the worker-side `conversations.id` from `chat.send`. This would break
   the existing gateway id contract and leak worker-local implementation
   details.
3. Store an explicit gateway-id mapping table. That is unnecessary while the
   gateway chat id is already the orchestrator route `chatId`.

## Annotations

- 2026-04-28 19:02 Completed with the approved scope. Verification passed:
  focused dispatcher/subscriber/orchestrator tests, changed-file ESLint,
  `@zonease/aiworker-core` typecheck, and the full
  `@zonease/aiworker-core` test suite. External test-server fleet to local
  Codex worker e2e was not run from this shell.
