# FEAT-018 Engine availability discovery

- **status**: completed
- **priority**: P1
- **owner**: BKD subtask cly4ayr3
- **createdAt**: 2026-04-23 05:00
- **completedAt**: 2026-04-23 05:35

## Description

Each worker runs the agentic CLIs (claude / codex / gemini / qwen-code /
cursor-agent) inside its own container. Today the frontend picker offers
every `EngineKind` blindly with no indication of whether the worker this
operator is configuring actually has that CLI installed or authenticated.
This causes silent failures when an operator saves a variant whose CLI
isn't present.

Model availability after vibe-kanban's `AvailabilityInfo` and bkd's
`getAvailability()`, but across the manager → worker boundary:

- **Worker side** probes its own container (PATH lookup + auth file mtime
  + `--version` shell-out where cheap).
- **Dashboard** proxies the probe through the existing transparent
  `/api/workers/:id/proxy/worker/*` path — no new manager-side logic.
- **Frontend** renders a small badge next to each engine option in the
  picker: `ready` / `installed but not logged in` / `not installed`.

Acceptance:

- **New** `apps/api/src/worker/executor/availability.ts` with
  `probeEngineAvailability(kind: EngineKind): Promise<AvailabilityInfo>`.
  Shape: `{ kind, status: 'login-detected' | 'installation-found' | 'not-found', binaryPath?, version?, authHint?, lastCheckedAt }`.
  - Reuse ACP's existing agent-specific probe paths from
    `engines/acp/agents/{gemini,qwen}.ts` by lifting them into the shared
    probe module (keep one source of truth).
  - Add probes for `claude-code` (PATH `claude`, `~/.claude.json` mtime),
    `codex` (PATH `codex`, `~/.codex/auth.json` mtime),
    `cursor` (PATH `cursor-agent`, `~/.cursor/auth.json` mtime — confirm
    path during implementation).
  - `http` / `mcp` / `cli` always report `ready` — they don't need a CLI.
- **New** route `GET /api/worker/engines` in `apps/api/src/worker/management/routes.ts`
  (bearer-auth'd). Returns `{ engines: AvailabilityInfo[] }` for every
  `EngineKind`. 10-minute in-memory cache with explicit `?refresh=1` query
  to bust.
- Frontend hook `useWorkerEngines(workerId)` in
  `apps/web/src/features/workers/hooks/use-worker-engines.ts` — TanStack
  Query against the transparent proxy, 10-minute stale time, suspense-aware.
- `executor-section.tsx` engine picker:
  - Each option shows a 2-color dot + short label (`ready` green,
    `login required` amber, `missing` gray).
  - Not-found engines stay clickable but the variant panel below renders an
    "Install this CLI in the worker container" notice linked to
    `docs/executor-engines.md#<engine>` (new doc, one block per engine listing
    npm package / shell command / auth instructions).
- **New** `docs/executor-engines.md` with one section per engine.
- Tests:
  - `availability.test.ts` (worker) stubs filesystem + PATH resolver, asserts
    the three-state mapping for every kind.
  - `routes.test.ts` adds a case for `GET /engines`.
  - Frontend `executor-section.test.tsx` adds a case showing the availability
    badges render correctly for each status.

## ActiveForm

Adding worker-side engine availability probing and a picker badge.

## Dependencies

- **blocked by**: (none — builds on FEAT-013/015 availability plumbing, both
  already merged).
- **blocks**: (none).

## Notes

- Related plan: `docs/plan/PLAN-008.md`.
- Probe is best-effort: a file mtime check cannot verify that a token is
  actually valid, only that an auth file exists. Keep the amber "login
  required" honest — it means "the CLI is installed but we can't confirm
  it's authenticated", not "the login is broken".
- Manager does **not** cache availability centrally; each worker owns its
  probe. Manager just proxies. This preserves the PLAN-004 data-domain
  boundary (manager never reads executor state).
- Auth probes read only file mtimes — never file contents — so no secrets
  leak through logs or responses.
- Reuse FEAT-013's `AvailabilityInfo` if compatible; otherwise promote a
  shared `AvailabilityInfo` type to `@aiworker/shared/providers` and
  migrate ACP's internal one to it.

### Implementation notes (2026-04-23 05:35)

Landed as `bkd/cly4ayr3` commit `c5d9db8`, merged to main in `d5332f5`. 16
files / +1327 / −87. Base correct (`aa10f69` = FEAT-017); no rework needed.

Key design decisions:

1. **Shared type surface in `@aiworker/shared/providers/availability.ts`** — `EngineAvailability`, `EngineAvailabilityStatus` (`ready | login-required | not-found`), `EngineAvailabilityResponse`. Consumed by worker probe, dashboard types, and frontend hook.
2. **Worker-side probe `apps/api/src/worker/executor/availability.ts`** — singleton `AvailabilityProbe` with DI-friendly `fsExists` / `resolveBinary` to keep tests hermetic. 10-minute cache with `resetAvailabilityProbeForTests()` for unit tests. Seven `EngineKind` entries; `acp` expands to two entries with `agent: 'gemini' | 'qwen'`.
3. **Probe rules stay file-only** — PATH lookup + auth file mtime. No `--version` shell-outs, no network. Honours the "cheap probe" risk entry in PLAN-008.
4. **ACP agent modules simplified** — `engines/acp/agents/gemini.ts` and `qwen.ts` drop their inline `authProbe` and import from the shared `availability.ts`. One source of truth. The existing `AvailabilityInfo` contract inside ACP is gone; callers now read the shared type.
5. **New route `GET /api/worker/engines`** (bearer-auth) in `management/routes.ts`; supports `?refresh=1` to bypass cache. Returns `{ engines: EngineAvailability[] }`.
6. **Frontend hook `useWorkerEngines(workerId)`** in `apps/web/src/features/workers/hooks.ts` — TanStack Query against the transparent proxy, 10-minute stale time. `refreshWorkerEngines()` helper invalidates the key.
7. **Executor picker UX** in `executor-section.tsx` — each engine option gets a 2-color dot + short label via `engine-availability.ts` status helper. Not-installed engines stay clickable; the variant panel renders a callout with a link to `docs/executor-engines.md#<engine>` when the chosen engine is absent. `acp` variant sub-picker (gemini / qwen) shows the per-agent badge. A Refresh icon-button next to the engine label triggers `refreshWorkerEngines()`.
8. **New doc `docs/executor-engines.md`** — one section per non-trivial engine (claude-code / acp-gemini / acp-qwen / codex / cursor) with install command, auth command, and container-embedding guidance.

Remaining items:

- P3: auth probe is still best-effort (file presence only). "login-required" honestly means "no auth file found", not "auth expired". This is the same limit vibe-kanban and bkd accept; matches PLAN-008 risk #3.
- P3: cursor auth path heuristic checked `~/.cursor/cli-config.json` and `~/.cursor-agent/` — validate against real CLI output before relying on it in prod.

Verification (coordinator-run after merge):

- `bun run typecheck` — shared / api / web all green.
- `bun test` — shared 18 / 18, api 429 / 429 (+16), web 32 / 32 (+6).
- `bun run lint` — 0 errors (baseline stays clean; FEAT-018 subtask moved a few non-component exports out of `executor-section.tsx` to silence `react-refresh/only-export-components`).
