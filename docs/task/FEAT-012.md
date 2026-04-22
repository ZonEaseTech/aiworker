# FEAT-012 Claude Code executor with git worktree workspace

- **status**: pending
- **priority**: P1
- **owner**: (unassigned)
- **createdAt**: 2026-04-22 09:20

## Description

Introduce the first true agentic-CLI adapter: Claude Code. It spawns the
`claude` CLI (or falls back to `npx -y @anthropic-ai/claude-code@<pinned>`)
with `-p --verbose --output-format=stream-json --input-format=stream-json`,
runs the "control protocol" over stdio (hooks: `PreToolUse`, `Stop`,
`tool_approval`), and translates the CLI's stream-json events into
`AgentEvent` entries defined by FEAT-011.

Each worker invocation gets an isolated workspace: a dedicated directory
under `WORKER_DATA_ROOT/workspaces/<conversationId>/`, optionally backed by a
git worktree when the worker config points at a git repository. Inside that
directory the CLI uses its own built-in Read / Edit / Bash tools — the
orchestrator does **not** inject `toolDefinitions` for this executor.

Acceptance:

- `apps/api/src/worker/executor/engines/claude-code/` module, split at minimum
  into `executor.ts`, `protocol.ts` (control protocol peer), `normalize.ts`
  (stream-json → `AgentEvent`), `types.ts`.
- `ExecutorConfig` gains a `claude-code` variant (minimal shape in this FEAT;
  formal three-tier config lands in FEAT-014 — guard against premature schema
  expansion).
- Spawn resolves command via PATH then `npx -y @anthropic-ai/claude-code@<env-pinned>`
  with a single env override (`CLAUDE_CLI_VERSION`) for upgrade flexibility.
- Tool-approval hook callback is surfaced as an `AgentEvent` entry that
  downstream consumers can route; FEAT-012 ships a default "auto-approve"
  policy only — interactive approval UI is out of scope.
- Worktree lifecycle (create / clean up on conversation close) documented
  and implemented with path-escape guard (reject anything outside
  `WORKER_DATA_ROOT`).
- End-to-end test: a web-channel envelope drives one full Claude Code turn,
  producing at least one assistant-message event + one tool-use event, with
  the transcript persisted to `worker.db.messages`.
- Test uses a stub CLI binary (shell script emitting pre-recorded
  stream-json) — do **not** require a real Claude license to run the test.

## ActiveForm

Building the Claude Code executor with per-conversation worktree isolation.

## Dependencies

- **blocked by**: FEAT-011
- **blocks**: FEAT-016

## Notes

- Related plan: `docs/plan/PLAN-007.md`.
- CLI version is env-driven, not source-pinned — per the vibe-kanban
  retrospective (hard-coded CLI versions forced double-maintenance).
- This FEAT intentionally lands without Codex / Gemini / Cursor so the
  control-protocol path stabilizes before ACP work begins.
- UI changes are limited to rendering new `AgentEvent` variants; the config
  editor picker arrives in FEAT-014.
