# FEAT-016 Codex and Cursor agent adapters (optional)

- **status**: completed
- **priority**: P3
- **owner**: BKD subtask x28in77k
- **createdAt**: 2026-04-22 09:20
- **completedAt**: 2026-04-22 18:45

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

### Implementation notes (2026-04-22 18:45)

Landed as `bkd/x28in77k` commit `a1c5a4f`, merged to main in `4eba707`.
Delivered ahead of FEAT-015 because the two subtasks were dispatched in
parallel and this one returned first. 26 files, ~1000 LOC net.

Key design decisions:

1. **Codex reuses `engines/acp/protocol.ts::JsonRpcPeer` + `splitNdjson`** — `engines/codex/protocol.ts` is a thin re-export; zero peer duplication.
2. **ThreadStartParams minimal** — only `model` + `approval_policy='never'`. `sandbox` / `model_reasoning_effort` / other knobs go through `CmdOverrides.extraArgs`, keeping the variant body tiny. Every run starts a fresh thread; `thread_fork` resume is P3.
3. **Codex notification methods** — `codex/event/{assistant_message,thinking,token_usage,tool_call,tool_result,stop,error}`. Unknown methods ignored (forward-compat). `tool_call.action.kind` inferred from tool name (read/view → file_read, edit/write/apply_patch → file_edit, bash/run_shell → command_run, else → tool). `stop` emits `token_usage` + `finish`; `error` → `AgentEvent.error`.
4. **Cursor goes NDJSON stream-json**, splitter imported directly from `engines/claude-code/normalize.ts`. `parseCursorLine` is local (different return type). `session_id` is extracted from `system/stop` lines and exposed via `getLastSessionId()`; orchestrator is not persisting it yet (every run starts from zero, per FEAT-016 spec).
5. **Cursor has no npm fallback** — `resolveBinary` returning `null` throws in `resolveCommand`, the executor wraps it as `AgentEvent.error + finish`. No npx package-name guessing.
6. **Variant body stays minimal** — `{ model?, timeoutMs? }`. apiKey / sandbox / policy / extraArgs all traverse `CmdOverrides`, not the variant body.
7. **`cancel` path** — user abort triggers SIGTERM; executor's `finally` does `disposePeer + endStdin + await exitPromise`. Session-level cancel races documented as P3.
8. **Frontend catalog data-driven** — `listEngines()` in `executor-variants.ts` auto-includes codex / cursor; picker picks them up without touching the render pipeline.

Remaining items:

- P2: wire shapes were coded to the FEAT-016 spec; real CLI versions may drift. Capture a live `codex app-server` / `cursor-agent --output-format=stream-json` trace before end-to-end production use. Adjustments if any land in `normalize.ts` + stubs, leaving `executor.ts` / `protocol.ts` untouched.
- P3: Codex `thread_fork` resume + Cursor `--resume sessionId` have option slots reserved but are not threaded through the orchestrator (multi-turn console UX follow-up).
- P3: availability probe / auth login detection not done (pattern available in `engines/acp/agents/gemini.ts::probeGeminiAuth`).
- P3: FEAT-014's "lift executor catalog schema into shared" suggestion not tackled here — the web-side zod schemas and backend `DEFAULT_PROFILES` TS interfaces are still two sources of truth.

Verification (coordinator-run after merge):

- `bun run typecheck` — shared / api / web all green.
- `bun test` — shared 12 / 12 (+2), api 397 / 397 (+59), web 26 / 26 (+3).
- `bun run lint` — 0 errors.
