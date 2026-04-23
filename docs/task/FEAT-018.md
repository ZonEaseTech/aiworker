# FEAT-018 Engine availability discovery

- **status**: pending
- **priority**: P1
- **owner**: (unassigned)
- **createdAt**: 2026-04-23 05:00

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
