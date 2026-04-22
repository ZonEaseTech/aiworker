# FEAT-013 ACP harness plus Gemini and Qwen adapters

- **status**: completed
- **priority**: P1
- **owner**: BKD subtask 9395s1ev
- **createdAt**: 2026-04-22 09:20
- **completedAt**: 2026-04-22 17:30

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

### Implementation notes (2026-04-22 17:30)

Landed as `bkd/9395s1ev` commit `06c8877`, merged to main in `128f790`.
18 files, +2141 / -0 (all new code). Subtask self-review passed; one
runtime bug was caught in smoke tests (stub path depth mis-count — 4
vs 5 parents from `engines/acp/` to `apps/api/`) and fixed before
reporting. All 61 new tests green.

Key design decisions the subtask made:

1. **ACP wire types hermetic** — `engines/acp/types.ts` stays module-local; nothing outside `engines/acp/*` imports it. Orchestrator only sees `AgentEvent`. Architectural commitment #1 satisfied.
2. **Data-driven agent registry** — `agents/types.ts` defines `AcpAgentDefinition` with just `commandName / npxPackage / versionEnvVar / defaultVersion / buildArgs / authProbe`. Adding a third ACP engine is a ~20-line file in `agents/` with zero harness change.
3. **Version resolution priority** — `config.cliVersion > env[versionEnvVar] > agent.defaultVersion`. Env vars: `GEMINI_CLI_VERSION`, `QWEN_CLI_VERSION`. Defaults (`gemini 0.9.0`, `qwen 0.0.14`) are safe placeholders — ops overrides expected in production.
4. **`JsonRpcPeer` is transport-agnostic** — decoupled from stdio, so `protocol.test.ts` covers it by injecting `handleLine` + capturing `writeLine` with zero child-process dependency.
5. **`AsyncEventQueue`** — bridges the Peer's notification callbacks and the generator consumer; `promptPromise.then` closes the queue on `stopReason`, cleanly driving the generator to finish.
6. **Child exit hook** — when the CLI exits with `code !== 0`, harness actively closes the queue and disposes the peer so callers don't wait the full 120s RPC timeout before getting an error.
7. **Auto-approve belt + braces** — `--yolo` CLI flag avoids permission prompts, and `onRequest` handles `session/request_permission` defensively returning allow in case a future CLI stops honouring yolo.
8. **Workspace reuse** — `input.workspacePath` threads directly through both `spawn.cwd` and ACP `session/new.cwd`. No new workspace machinery; FEAT-012's `WorkspaceManager` + path-escape guard still owns the lifecycle.

Remaining items deferred:

- P2: not yet registered on `ProcessManager` — FEAT-015.
- P2: auth-probe is mtime on `~/.gemini` / `~/.qwen`; no `--version` shell-out; no DB persistence (FEAT-013 acceptance explicitly permits deferral).
- P3: default CLI versions are placeholders; ops must override before production use of gemini / qwen.

Verification (coordinator-run after merge):

- `bun run typecheck` — shared / api / web all green.
- `bun test` — shared 7 / 7, api 319 / 319 (61 new), web 17 / 17.
- `bun run lint` — 6 pre-existing baseline errors, zero new.
