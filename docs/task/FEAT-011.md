# FEAT-011 Normalize AgentEvent schema and refactor OpenAI-compat executor

- **status**: completed
- **priority**: P1
- **owner**: ben
- **createdAt**: 2026-04-22 09:20
- **startedAt**: 2026-04-22 09:40
- **completedAt**: 2026-04-22 09:50

## Description

Replace the narrow `ChatStreamChunk` union with a richer, engine-agnostic `AgentEvent`
schema inspired by vibe-kanban's `NormalizedEntry` / `ActionType` and bkd's
`NormalizedLogEntry` / `ToolAction`. The new schema must be able to carry
assistant-message deltas, thinking/reasoning deltas, tool-use start/result pairs
(with a judged `ActionType`), permission/approval prompts, token usage, and
finish reasons in a single discriminated union. All downstream consumers —
orchestrator message persistence, `handleExecutorTest` tiny-probe, channel
delivery, SSE emission, evolution observer — are reworked to consume
`AgentEvent` instead of `ChatStreamChunk`.

As part of this task, the existing `OpenAICompatibleExecutor` is re-expressed
as the first producer of `AgentEvent` (mapping OpenAI function calls to the
new `action: 'tool'` entries, `usage` to `token_usage`). No new engines are
introduced in this FEAT — it exists to prove the schema against the one
executor currently on the hot path, and to freeze the contract before any
CLI adapter work begins.

Acceptance:

- `AgentEvent` tagged union committed in `packages/shared/src/providers/executor.ts`
  (or a new `agent-events.ts` next to it), with Zod schema for validation.
- `ExecutorProvider` renames `runChat` to `run(input): AsyncIterable<AgentEvent>`
  (or keeps `runChat` but returns `AgentEvent`) with an adapter shim so existing
  call sites compile until swapped.
- `OpenAICompatibleExecutor` re-emits every previous `ChatStreamChunk` variant
  as an equivalent `AgentEvent`, and `http.test.ts` is updated accordingly.
- `Orchestrator.run()` consumes `AgentEvent` and persists assistant text,
  tool-use entries, and finish reasons using the new shape.
- `handleExecutorTest` tiny-probe updated.
- `bun run check` and relevant unit tests clean.

## ActiveForm

Normalizing the worker agent event schema and rewiring the OpenAI-compat executor.

## Dependencies

- **blocked by**: (none)
- **blocks**: FEAT-012, FEAT-013, FEAT-015, FEAT-016

## Notes

- Related plan: `docs/plan/PLAN-007.md`.
- Scope is intentionally limited to one producer — do not introduce any new
  engine adapter in this FEAT even if tempting; keep the schema change atomic.
- Preserve the ability to emit `'text'` deltas on the SSE stream; UI rendering
  should be unchanged after this FEAT.

### Implementation notes (2026-04-22 09:50)

Landed the schema as `packages/shared/src/providers/agent-event.ts`
(`AgentEvent` discriminated union + `ToolAction` / `ToolStatus` /
`TokenUsage` / `AgentFinishReason`, all backed by zod schemas). The
`ExecutorProvider` interface renames `runChat` → `run(input:
AgentRunInput): AsyncIterable<AgentEvent>`; adapter shim was not needed
because all call sites live in-repo and were updated atomically in the
same commit set (orchestrator, conversation classifier, tiny probe,
three provider implementations plus their tests). Legacy
`ChatStreamChunk` / `ChatRunInput` / `ChatFinishReason` / `ChatUsage`
types were removed outright rather than aliased — the old discriminator
names (`text`, `tool_call`) differ from the new schema's
(`assistant_message_delta`, `tool_use`) so an alias would be
misleading. SSE event names (`orchestrator.text`,
`orchestrator.tool_call`) are preserved so the UI contract is unchanged.

Worker `shared` package now carries a `zod` runtime dep and a
`@types/bun` dev dep; its tsconfig enabled `types: ["@types/bun"]` so
the new schema test compiles.

`OpenAICompatibleExecutor` emits the full event palette (text deltas,
`tool_use` with `action: { kind: 'tool', toolName }` for generic OpenAI
function calls, `token_usage`, `finish`). Richer `action.kind`
classification (file-edit / command-run etc.) is engine-specific and
arrives with Claude Code and ACP adapters in later FEATs.

Verification:

- `bun run typecheck` clean across shared, api, web.
- `bun test` — 7 pass in shared (new schema suite), 210 pass in api
  (including `http.test.ts` rewritten against `AgentEvent`), 17 pass
  in web.
- `bun run lint` back to the pre-existing main baseline (6 unrelated
  errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`,
  `scripts/deploy.ts`); this FEAT introduced zero new lint errors.
