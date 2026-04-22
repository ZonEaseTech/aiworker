# FEAT-013 ACP harness plus Gemini and Qwen adapters

- **status**: pending
- **priority**: P1
- **owner**: (unassigned)
- **createdAt**: 2026-04-22 09:20

## Description

Add an Agent Client Protocol (ACP) harness that multiple agentic CLIs can
share, then wire Gemini CLI and Qwen Code as data-driven adapters on top of
it. The harness owns protocol framing (stdio ndjson, request / notification
envelopes, session start / turn / cancel) and translates ACP events into
`AgentEvent` entries. Each concrete agent contributes only a 20-line
declaration file — command name, npx fallback, ACP invocation flags, auth
probe — following bkd's `engines/executors/acp/agents/*.ts` shape.

Acceptance:

- `apps/api/src/worker/executor/engines/acp/` module with `harness.ts`,
  `protocol.ts`, `normalize.ts`, `agents/{gemini,qwen}.ts`.
- `ExecutorConfig` gains `{ type: 'acp', agent: 'gemini' | 'qwen', ... }`
  (minimal shape; formal three-tier in FEAT-014).
- `@google/gemini-cli` and `@qwen-code/qwen-code` are invoked via the shared
  harness; both produce assistant-message events and at least file-edit /
  command-run tool-use events.
- Adding a third ACP agent later must require only a new data file in
  `agents/`, no harness changes.
- Stubbed ACP binary test fixture used for both agents — real CLI is not
  required to run the unit test.
- Worktree / workspace handling reuses the mechanism introduced in FEAT-012.

## ActiveForm

Adding an ACP harness plus Gemini and Qwen adapters.

## Dependencies

- **blocked by**: FEAT-011, FEAT-012 (workspace mechanism)
- **blocks**: (none — Cursor agent joins as a native adapter under FEAT-016
  because it does not speak ACP)

## Notes

- Related plan: `docs/plan/PLAN-007.md`.
- Copilot, Aider, Amp and other ACP-speakers can be queued as future
  follow-ups on the same harness; scope here is strictly Gemini + Qwen.
- Authentication discovery: the harness reports `LoginDetected | InstallationFound | NotFound`
  (see vibe-kanban `AvailabilityInfo`), cached in-memory; DB persistence is
  optional and can be deferred.
