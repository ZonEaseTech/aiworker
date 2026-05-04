# PLAN-081 Claude Code streamed text append-only contract

- **status**: completed
- **createdAt**: 2026-05-04 02:43
- **approvedAt**: 2026-05-04 02:43
- **completedAt**: 2026-05-04 02:47
- **relatedTask**: BUG-052

## Current State

1. `BUG-052` was reproduced with the published `@zonease/aiworker-cli@0.5.3`
   package and a real `claude-code/default` executor in a remote Coder
   workspace.
2. `packages/core/src/worker/executor/engines/claude-code/normalize.ts`
   currently maps both Claude Code `stream_event.content_block_delta`
   `text_delta` records and later full `assistant.message.content[].text`
   blocks to `assistant_message_delta`.
3. `packages/core/src/worker/orchestrator/service.ts` treats every
   `assistant_message_delta` as append-only text and emits
   `orchestrator.text.payload.delta` without extra snapshot metadata.
4. `apps/web/src/worker/features/chat/chat-panel.tsx`, gateway subscriber code,
   and `aiworker run` consumers already append `payload.delta`, so the current
   duplicate comes from the Claude Code adapter rather than the UI or CLI.
5. Existing Claude Code fixtures intentionally include one partial text delta
   followed by a full assistant text block, but tests only assert that some text
   is emitted; they do not lock the append-only contract.

## Proposal

1. Document the contract as append-only: `orchestrator.text.payload.delta` is a
   text delta, not a full snapshot. If a future consumer needs snapshots, it
   should use a distinct field or event type.
2. Keep `normalizeLine()` stateless for single-line normalization, but add a
   small stateful guard in `ClaudeCodeExecutor.runIterable()` so once
   `stream_event` text deltas have been observed for the current assistant
   message, matching final assistant text blocks are not yielded as additional
   `assistant_message_delta` events.
3. Preserve assistant final text fallback when Claude Code does not emit partial
   text deltas, because that is still needed for buffered/non-partial output.
4. Preserve tool events, token usage, finish handling, session binding, and
   resume behavior unchanged.
5. Add focused tests at the Claude Code executor level and adjust orchestrator
   coverage to assert the emitted deltas concatenate to the final response
   exactly once.

## Risks

1. Claude Code stream-json may emit multiple assistant messages in one run
   around tool calls. The suppression needs to reset at assistant-message
   boundaries and avoid hiding a later non-duplicated assistant text block.
2. If a full assistant block differs from the observed partial text, broad
   suppression could lose legitimate text. The guard should only suppress exact
   already-streamed text for that assistant message.
3. The current stub covers simple text/tool/text flow. It may need a dedicated
   fixture or test hook to cover partial split deltas followed by one full
   assistant block.
4. Real CLI smoke with Claude Code may be unavailable locally if the executor is
   not authenticated; focused unit/integration tests remain the required gate.

## Scope

- `packages/core/src/worker/executor/engines/claude-code/executor.ts`
- `packages/core/src/worker/executor/engines/claude-code/executor.test.ts`
- `packages/core/src/worker/orchestrator/service.claude-code.test.ts`
- `docs/cli.md`
- `docs/task/BUG-052.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Out Of Scope

- Changing the public worker SSE event name.
- Adding a snapshot event or `payload.text` field in this fix.
- Changing Worker Admin append behavior.
- Changing CLI NDJSON output formatting.
- Reworking Codex, ACP, Cursor, HTTP, or MCP executor normalization.
- Running remote Coder validation unless explicitly requested after the local
  gates pass.

## Verification

- Passed: `bun test packages/core/src/worker/executor/engines/claude-code/executor.test.ts`
- Passed: `bun test packages/core/src/worker/orchestrator/service.claude-code.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-core' test`
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- Passed: `bunx eslint packages/core/src/worker/executor/engines/claude-code/executor.ts packages/core/src/worker/executor/engines/claude-code/executor.test.ts packages/core/src/worker/orchestrator/service.claude-code.test.ts`
- Passed: `git diff --check`

## Result

- `orchestrator.text.payload.delta` is documented as append-only text.
- Claude Code executor now keeps streamed partial text as the emitted output and
  removes the already-streamed prefix from the later full assistant block.
- Buffered Claude Code output without partial text still emits assistant text via
  the existing final block fallback.
- Tool events, token usage, finish events, session binding, and resume behavior
  remain unchanged.

## Notes

- 2026-05-04 02:43 Created from BUG-052 investigation. Awaiting approval before
  implementation.
- 2026-05-04 02:43 Approved and claimed for implementation.
- 2026-05-04 02:47 Implemented, verified, and completed.
