# PLAN-230 Worker Web structured session timeline

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 22:05
- **relatedTask**: REFACTOR-054

## Current State

- Worker Web renders the events it receives, but adjacent text deltas are not
  merged and stderr logs can dominate the assistant flow.
- The existing tool card only works cleanly when a matching tool result shares
  the same id shape.
- The session route has scroll behavior, but this change needs another browser
  pass after the backend emits richer event streams.

## Proposal

1. Normalize OD-style event payloads in `WorkerSessionChat`.
2. Merge adjacent text and thinking deltas into readable assistant blocks.
3. Match `tool_result.toolUseId` / AIWorker `id` shapes so real engine tools
   render as coherent cards.
4. Keep raw/stderr data collapsed and secondary, with failures surfaced as
   explicit errors.
5. Update Web tests to cover structured tool/text events and absence of
   success-path stderr dominance.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser desktop/mobile scroll validation.

## Result

- `WorkerSessionChat` now normalizes streamed status/text/thinking/tool/result,
  usage, raw, artifact, review, lesson, and error events.
- Adjacent assistant text/thinking deltas are merged into readable blocks.
- Tool result ids accept both AIWorker `id` and engine-native `toolUseId`.
- Raw engine lines remain collapsed; Codex file-change events now render as
  structured status events rather than raw JSON.
- Worker Web uses the streamed initial-session endpoint so the first user
  message is visible in the session route while the engine is still running.
