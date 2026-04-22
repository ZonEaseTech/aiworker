# FEAT-016 Codex and Cursor agent adapters (optional)

- **status**: pending
- **priority**: P3
- **owner**: (unassigned)
- **createdAt**: 2026-04-22 09:20

## Description

Optional follow-on covering two engines that do not fit the ACP harness:

- **Codex CLI** (`@openai/codex` `app-server`) — JSON-RPC over stdio
  (`initialize` → `startThread` → `startTurn` → `codex/event/*`). Benefits from
  a dedicated `protocol.ts` peer analogous to Claude Code's control protocol.
- **Cursor agent** (`cursor-agent -p --output-format=stream-json`) — native
  stream-json with the prompt-over-stdin + `stdin.shutdown()` spawn pattern.

Each adapter lives under `apps/api/src/worker/executor/engines/<engine>/`
following the layout established by FEAT-012, and registers a variant in
`default-profiles.ts`.

Acceptance (per adapter):

- Spawn + normalize to `AgentEvent`.
- Follow-up (multi-turn) resumption using each engine's session-id / fork
  mechanism.
- Stubbed binary test fixture (no real licence required).
- Documented in `docs/architecture.md`.

Acceptance (combined):

- Each engine can be selected in the frontend picker.
- Executor list (health + availability) surfaces both in the dashboard.

## ActiveForm

Adding Codex and Cursor adapters as optional engines.

## Dependencies

- **blocked by**: FEAT-011, FEAT-012, FEAT-014
- **blocks**: (none)

## Notes

- Related plan: `docs/plan/PLAN-007.md`.
- Scope is explicitly gated as optional / P3: ship it only if FEAT-011..015
  are green and the team has bandwidth, or if a user request specifically
  needs Codex / Cursor. Closing this task without implementation is a
  legitimate outcome.
