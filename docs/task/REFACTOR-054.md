# REFACTOR-054 Structured engine session parity

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 22:05
- **claimedAt**: 2026-05-10 22:05
- **completedAt**: 2026-05-10 22:31
- **plan**: PLAN-228, PLAN-229, PLAN-230, PLAN-231
- **relatesTo**: packages/core, apps/api, apps/web, Open Design session runtime

## Problem

Worker Web now has a session route, but the runtime still wraps the selected
engine as one fake Bash command. Codex is invoked without structured JSON
events, stderr is surfaced as the primary process view, and the turn fails when
no exact artifact file is produced. This is not the Open Design session model:
OD runs external engines through daemon-owned invocations, parses structured
engine streams, stores message events, and treats produced files as outputs of a
message rather than as a mandatory condition for every message.

## Goal

Port the Open Design engine/session contract into AIWorker's architecture:

- keep `session` as the user-facing conversation thread;
- keep `engine_invocation` as the internal technical attempt;
- use the correct local CLI invocation mode for every surfaced engine;
- parse structured engine event streams into AIWorker `session_events`;
- stop surfacing stderr as the only timeline;
- allow text-only turns to succeed while still indexing business artifacts when
  an engine creates them;
- keep the Web focused on the engine process, assistant message, artifact, and
  review surfaces.

## Acceptance Criteria

- Codex uses `codex exec --json` with stdin prompt delivery, workspace cwd, and
  network-enabled workspace-write config.
- Claude Code, Cursor Agent, Gemini CLI, OpenCode, and Qwen Code local CLI paths use the
  Open Design-style non-interactive argument shapes where available.
- Structured stdout streams are parsed into typed status, text, thinking, tool,
  file-change, usage, and raw events instead of being shown as stdout/stderr
  logs.
- Initial session creation and follow-up turns both support streamed session
  timelines, so Worker Web enters the session route before the engine finishes.
- Stderr is stored for audit and surfaced as an error tail only when the engine
  fails.
- A session turn can succeed with assistant text and no artifact.
- Artifact registration uses files actually produced under the workspace
  artifact area, not a fake artifact copied from the final message.
- Web tests and browser validation show visible engine process events rather
  than one collapsed stderr block.
- Focused core/API/Web gates and code-review-graph pass.

## Notes

This task supersedes the Bash-wrapper patch direction from BUG-088 /
PLAN-226. It does not reintroduce user-visible runs; OD `run` maps to
AIWorker `engine_invocation`.

## Result

- `packages/core` now has a local engine definition layer and structured stream
  parser for the surfaced local engines.
- Successful runs store stdout/stderr under the invocation root, but stderr no
  longer dominates the successful session timeline.
- Worker Web renders streamed status/tool/text/file-change/usage events for the
  initial turn and follow-up turns.
- Unsupported ACP engines are not surfaced as Local CLI engines until AIWorker
  has a correct ACP adapter.
- The daemon now launches local engines through the path resolved during
  Settings scan/test, so installed binaries outside the daemon's inherited PATH
  are not falsely marked runnable.
