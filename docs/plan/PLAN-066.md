# PLAN-066 Worker Admin selected conversation continuation

- **status**: completed
- **createdAt**: 2026-05-02 21:17
- **approvedAt**: 2026-05-02 21:22
- **completedAt**: 2026-05-02 21:29
- **relatedTask**: BUG-044

## Current State

1. Worker Admin Chat already lists conversations and derives an active
   conversation for the message timeline.
2. Sending from Worker Admin currently calls `useSubmitTask()`, which posts to
   `POST /api/worker/orchestrator/tasks` without a conversation hint.
3. `Orchestrator.submitTask()` always creates a web envelope with
   `accountId = sys:task` and `chatId = task:<task-id>`, so every send gets a
   fresh session key and a fresh conversation.
4. `Orchestrator.ingest()` already preserves worker/executor continuity when
   inbound envelopes share the same route session key.
5. Current Chat SSE binding is task-id oriented and can bind from matching
   `orchestrator.*` events even when no `conversation.created` event arrives.

## Proposal

1. Add a dedicated worker orchestrator continuation API, likely
   `POST /api/worker/orchestrator/conversations/:id/messages`, with the same
   prompt validation as task submission.
2. Add a core orchestrator method that looks up the selected open
   conversation's active `session_entries` row, creates a task record for the
   operator send, then ingests an envelope using the selected conversation's
   existing `channel/chatId/threadId/accountId` route instead of `task:<id>`.
3. Keep new-conversation task submission as the explicit "new conversation"
   path; do not change the semantics of `submitTask()`.
4. Update Worker Admin Chat so sending while a conversation is selected calls
   the continuation API, and add an explicit new-conversation control that
   switches the composer back to `submitTask()`.
5. Keep SSE correlation keyed by the returned task id, with the selected
   conversation id as the expected continuation target.

## Risks

1. Existing conversation rows without an active `session_entries` mapping
   cannot safely reconstruct `accountId`; before 1.0, prefer a clear 404/409
   over guessing a legacy route.
2. The Chat UI must avoid auto-creating new conversations just because the
   most recent conversation is visible; new conversation creation should be
   explicit.
3. BUG-045 still owns task lifecycle status updates, so this plan should not
   broaden into fixing stale `agent_tasks.status`.
4. A real Codex-backed smoke can be blocked by local auth or long executor
   latency even if focused tests pass.

## Scope

- `packages/core/src/worker/orchestrator/service.ts`
- focused core orchestrator tests for selected conversation continuation
- `apps/api/src/worker/orchestrator/routes.ts`
- focused API route tests for continuation validation and dispatch
- `apps/web/src/worker/api.ts`
- `apps/web/src/worker/lib/hooks.ts`
- `apps/web/src/worker/features/chat/chat-panel.tsx`
- focused Worker Admin Chat tests
- `docs/task/BUG-044.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Out Of Scope

- `BUG-045` task lifecycle transitions from `queued` to terminal states.
- Executor timeout/probe behavior from `BUG-046`.
- No-token Worker Admin auth UX from `BUG-047`.
- Gateway WS chat protocol changes.
- Database schema or migration changes.

## Verification

- Passed: `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- Passed: `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-web' test -- src/worker/features/chat/chat-panel.test.tsx src/worker/api.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-api' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bunx eslint packages/core/src/worker/orchestrator/service.ts packages/core/src/worker/orchestrator/service.history.test.ts apps/api/src/worker/orchestrator/routes.ts apps/api/src/worker/orchestrator/routes.test.ts apps/web/src/worker/api.ts apps/web/src/worker/api.test.ts apps/web/src/worker/lib/hooks.ts apps/web/src/worker/features/chat/chat-panel.tsx apps/web/src/worker/features/chat/chat-panel.test.tsx`
- Passed: `git diff --check`
- Not run: real Worker Admin smoke. The focused core test verifies selected
  continuation reuses the executor-native binding; no local browser smoke was
  needed for this source-only fix.

## Result

- Worker Admin now has an explicit new-conversation mode and a selected
  conversation continuation mode.
- `POST /api/worker/orchestrator/conversations/:id/messages` accepts selected
  conversation prompts with the same validation as task submission.
- `Orchestrator.continueConversation()` reuses the selected conversation's
  active session route and bypasses classifier-driven new-topic rotation for
  this operator-selected path.
- SSE correlation remains task-id based for both new and continuation sends.
