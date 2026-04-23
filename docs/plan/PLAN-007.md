# PLAN-007 Multi-engine executor refactor

- **status**: completed
- **createdAt**: 2026-04-22 09:20
- **approvedAt**: 2026-04-22 09:40
- **completedAt**: 2026-04-22 19:15
- **relatedTask**: FEAT-011, FEAT-012, FEAT-013, FEAT-014, FEAT-015, FEAT-016

## Context

### Current state

Today a worker only usefully runs one executor type. `ExecutorConfig`
(`packages/shared/src/fleet/config.ts:26`) is a narrow discriminated union
of `http` / `mcp` / `cli`, and only `http` (`OpenAICompatibleExecutor`,
`apps/api/src/worker/executor/providers/http.ts`) actually implements
`runChat`. `McpExecutor` and `CliExecutor` yield an error from `runChat` by
design — they exist for tool listing / tool invocation, not model chat.

The orchestrator hot path (`apps/api/src/worker/orchestrator/service.ts:43`)
depends on one interface: `ExecutorProvider.runChat` emitting a narrow
`ChatStreamChunk` union of `text | tool_call | finish | error`. Everything
downstream — message persistence, SSE events, evolution observer,
`handleExecutorTest` tiny-probe — is wired to that shape.

Concurrency is `AsyncQueue` (`orchestrator/queue.ts`, 10-line single-lane
FIFO). The worker config stores one `executor` object, not a list; there is
no concept of "profile" or "variant".

Frontend configuration at
`apps/web/src/features/workers/components/config-editor/executor-section.tsx`
mirrors the three-way type picker one-to-one with the backend union.

### Research findings

Two mature reference projects were surveyed (see the parallel
agent reports distilled into this plan):

- **BloopAI/vibe-kanban** — Rust + React workspace. Nine agentic CLIs:
  Claude Code, Codex, Gemini, Qwen Code, Cursor agent, OpenCode, Amp,
  Copilot, Droid. Shared trait `StandardCodingAgentExecutor` (spawn,
  spawnFollowUp, normalizeLogs, default_mcp_config_path,
  get_availability_info, discover_options, get_preset_options). Uniform
  event schema `NormalizedEntry { entry_type, content, metadata }` with
  nested `ActionType` (file-read / file-edit / command-run / tool / ...).
  Three-tier config: `BaseCodingAgent × variant × {model_id, reasoning_id,
  permission_policy}` overrides. Universal `CmdOverrides` via
  `#[serde(flatten)]`. Each task attempt gets an independent git worktree.
- **bkhq/bkd** — TypeScript + Bun + Hono + Drizzle (same stack as us).
  `EngineExecutor` interface (`engineType`, `protocol`, `capabilities`,
  spawn, spawnFollowUp, cancel, getAvailability, getModels,
  normalizeLog, createNormalizer). Four concrete executors cover five
  engine types by sharing one ACP harness across Gemini / Codex / Claude
  (virtual engine types `acp:<agent>`). Generic `ProcessManager<TMeta>`
  owns child-process lifecycle, grouping, concurrency cap, auto GC, stall
  detection. Each issue gets its own git worktree. Configuration is
  hard-coded built-in profiles plus key-value `app_settings`.

Shared takeaways applicable to AIWorker:

1. The chat-chunk union must be expanded into an engine-agnostic event
   schema before any CLI adapter is written — otherwise every adapter
   leaks its own wire shape into the orchestrator.
2. ACP is the cheapest path to multiple engines (Gemini / Qwen at
   minimum); a single harness + 20-line data files is viable.
3. CLI-specific protocols (Claude Code control protocol, Codex JSON-RPC,
   Cursor stream-json) cannot be abstracted at the "request" layer — they
   can only be unified at the "normalized event" layer.
4. A three-tier configuration (engine × variant × override) scales to
   "same engine, different reasoning / permission presets" without a
   schema change per preset.
5. A named-class priority queue beats bkd's "throw on full" semantics and
   our current "always serial" queue.

### Files and modules touched

Direct edits (full list consolidated across all six FEATs):

- `packages/shared/src/providers/executor.ts` — `AgentEvent` schema,
  `ExecutorProvider` reshape.
- `packages/shared/src/fleet/config.ts` — executor config moved out /
  re-exported.
- `packages/shared/src/fleet/executor.ts` (new) — three-tier config
  shape.
- `apps/api/src/worker/executor/factory.ts` — registry over engines.
- `apps/api/src/worker/executor/engines/<engine>/` (new tree) — per-engine
  adapters: `claude-code`, `acp/{harness,agents/{gemini,qwen}}`, `codex`,
  `cursor`, plus rehomed `http`, `mcp`, `cli`.
- `apps/api/src/worker/executor/default-profiles.ts` (new) — embedded
  variant catalogue.
- `apps/api/src/worker/executor/workspace.ts` (new) — per-conversation
  worktree / directory lifecycle.
- `apps/api/src/worker/orchestrator/service.ts` — consume `AgentEvent`,
  replace `runChat` call, add workspace handoff.
- `apps/api/src/worker/orchestrator/queue.ts` → `process-manager.ts`
  (rename / rewrite in FEAT-015).
- `apps/api/src/worker/management/executor-test.ts` — accept new events.
- `apps/web/src/features/workers/components/config-editor/executor-section.tsx`
  — two-step picker (engine, variant) with variant-specific form.
- `apps/web/src/lib/api.ts` — types for three-tier config + capacity
  endpoint.
- `docs/architecture.md` — executor section rewritten.

Indirect / test surface:

- `apps/api/src/worker/executor/providers/http.test.ts` — update to
  `AgentEvent`.
- Smoke script `apps/api/scripts/smoke-plan-004.ts` — unchanged API, but
  behaviour validated again at the end.
- `apps/api/src/worker/orchestrator/service.ts` SSE payload shape — may
  require a versioning bump if event names change.

## Proposal

### Phased delivery

The refactor is sliced into six FEATs with explicit ordering. Each FEAT is
an independently reviewable PR and lands behind the previous one on main.

| # | FEAT | Essence | Dependencies | Risk |
|---|------|---------|--------------|------|
| 1 | FEAT-011 | `AgentEvent` schema + OpenAI-compat retrofit | — | Low |
| 2 | FEAT-012 | Claude Code executor + worktree workspace | FEAT-011 | High (hot path + new control protocol) |
| 3 | FEAT-013 | ACP harness + Gemini / Qwen adapters | FEAT-011, FEAT-012 | Medium |
| 4 | FEAT-014 | Three-tier ExecutorConfig + frontend picker | FEAT-011, FEAT-012 | Medium (config migration) |
| 5 | FEAT-015 | `ProcessManager` replacing `AsyncQueue` | FEAT-011, FEAT-012, FEAT-014 | Medium (hot path concurrency) |
| 6 | FEAT-016 | Codex + Cursor adapters (optional) | FEAT-011, FEAT-012, FEAT-014 | Low |

See each `docs/task/FEAT-011.md` .. `FEAT-016.md` for per-FEAT acceptance
criteria.

### Architectural commitments

These become `CLAUDE.md` "Architecture Constraints" additions on FEAT-011
merge:

1. **Executor events are normalized.** Every `ExecutorProvider`
   implementation emits only `AgentEvent` tagged-union entries. Wire
   shapes specific to Claude control protocol / ACP / stream-json /
   JSON-RPC stay inside the engine module; they must never reach the
   orchestrator.
2. **Engines are registered, not switched.** `buildExecutor(config)` looks
   up `engine` in a registry (`engines/registry.ts`) rather than a
   long `switch`. New engines register themselves at module import;
   factory knows only how to dispatch.
3. **Variants own the full CLI invocation.** Binary, args, env, and
   version are variant-body fields; `CmdOverrides` lets operators inject
   overrides without adapter changes. Do not scatter flags across the
   app config or env.
4. **Per-conversation workspace is the default.** Any engine that spawns
   an agentic CLI owns its own `WORKER_DATA_ROOT/workspaces/<convId>`
   directory (optionally a git worktree). Path-escape guard required.
5. **Process lifecycle lives in `ProcessManager`.** No engine holds
   long-lived child-process handles directly; all spawns register into
   the manager and receive a handle.

### Why this order

- FEAT-011 first because every later FEAT produces `AgentEvent` — freezing
  the schema against a known-good producer (OpenAI compat) reduces the
  cost of the schema being wrong.
- FEAT-012 second because Claude Code has the most protocol surface area
  (control protocol + hooks). If the chosen `AgentEvent` shape can carry
  tool-approval callbacks, it can carry everything else.
- FEAT-013 next because ACP is the cheapest unit-of-new-engine and its
  data-driven design validates the engine registry pattern.
- FEAT-014 after at least one agentic variant exists so the picker has
  real content to render.
- FEAT-015 after we have real child processes to babysit and variant
  metadata to drive slot budgets.
- FEAT-016 last, optional, because its engines offer marginal capability
  beyond FEAT-012 + FEAT-013 and can be dropped without blocking the
  refactor.

## Risks

1. **Hot-path regression.** `runChat` is the single interface consumed by
   the orchestrator today; renaming / reshaping it touches message
   persistence and SSE. Mitigation: FEAT-011 keeps the OpenAI-compat
   executor semantics identical from the user's perspective (text
   delta → message, tool_call → tool event, finish → finalize) with an
   end-to-end test before landing.
2. **CLI version drift.** Hard-pinning `@anthropic-ai/claude-code@X.Y.Z`
   in source forces dual maintenance (source + image). Mitigation:
   version is env-driven, images preload common versions into
   `/opt/cli-versions/`, variant points at a version name.
3. **Worktree leakage.** Long-lived conversations could accumulate
   disk usage. Mitigation: FEAT-012 implements TTL-based GC and path
   guard; the SaaS retention policy is documented in architecture.md.
4. **Config migration backward compatibility.** Existing deployments have
   `{type:'http',...}` in `worker_config.configJson`. Mitigation: FEAT-014
   auto-upgrades on boot and reports a changelog entry; old shape is
   reader-only for one release.
5. **Claude Code control-protocol complexity.** It is a bidirectional
   JSON-RPC channel with hook-registered callbacks. Mitigation: ship
   FEAT-012 with auto-approve-only policy; interactive approval UI is
   explicitly out of scope and tracked as a follow-up.
6. **Concurrent reload + in-flight processes.** Today `AsyncQueue` lives
   on the orchestrator instance; `state.runtime` hot-reload disposes
   the old orchestrator. FEAT-015 must ensure in-flight processes from
   the old runtime are drained or migrated — see worker runtime
   `dispose()` contract. Mitigation: `ProcessManager` persists across
   hot-reloads at the runtime singleton level, not per-orchestrator.
7. **Test-CLI proliferation.** Each adapter wants a stub binary. Keep
   these as small shell scripts under `apps/api/test-fixtures/cli/` —
   do not compose a mocking framework for this.

## Scope

- 6 FEATs, landed in order, each an independent PR against main.
- Estimated rough sizing: FEAT-011 small (~400 LOC), FEAT-012 large
  (~1400 LOC including tests), FEAT-013 medium (~700 LOC), FEAT-014
  medium (~700 LOC split backend / frontend), FEAT-015 medium
  (~500 LOC), FEAT-016 large if both (optional).
- Total touched files estimate: ~35 new, ~12 modified.
- Out of scope (explicit):
  - Interactive tool-approval UI.
  - Remote model discovery streams (vibe-kanban `discover_options`).
  - LLM-based request routing / fan-out / auto-selection.
  - Tenant-wide executor sharing (each worker still owns its own
    config).
  - MCP-as-executor upgrade (the existing `mcp` type stays as a
    tool-source shim).

## Alternatives

### Alternative A — single giant REFACTOR-003 PR

Land the full refactor in one branch, rebased over main. Upside: minimal
ceremony, no intermediate schema contortions. Downside: unreviewable
diff size (estimate 3500+ LOC), rollback requires reverting a foundation
of later work, blocks all other worker changes for weeks. **Rejected.**

### Alternative B — adopt ACP as the only engine protocol

Write only an ACP harness; require every new engine to speak ACP via a
translation shim. Upside: smallest engine-count-to-code ratio. Downside:
Claude Code / Codex / Cursor / Amp do not speak ACP today; translation
shims become their own protocol surface. **Rejected** — the vibe-kanban
data shows five protocol families coexisting, and forcing ACP-only
trades engine support for abstraction.

### Alternative C — bkd-style no-named-profile layer

Skip FEAT-014's "variant" concept and let the user type raw CLI flags
per-worker. Upside: less config surface. Downside: no way to save
"my-claude-opus-plan-mode preset" without full re-typing; bkd's own
retrospective calls this out as their biggest UX gap. **Rejected.**

### Alternative D — embed LLM-based request router now

Ship FEAT-017 "auto-route among engines by task" alongside the refactor.
Upside: differentiator. Downside: needs engines to exist first and
requires a learning / feedback loop with no clear MVP scope. **Deferred**
to a future PLAN after PLAN-007 settles.

## Annotations

(pending user review)
