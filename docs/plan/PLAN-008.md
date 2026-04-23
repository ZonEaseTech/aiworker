# PLAN-008 Worker registration UX + engine availability

- **status**: completed
- **createdAt**: 2026-04-23 05:00
- **approvedAt**: 2026-04-23 05:00
- **completedAt**: 2026-04-23 05:35
- **relatedTask**: FEAT-017, FEAT-018

## Context

Post-PLAN-007 smoke on `https://gateway.example.test` surfaced three operator
papercuts that don't fit into any existing FEAT:

1. `Base URL` placeholder `https://worker.example.com` gives no hint about
   scheme / port / path conventions.
2. `Bootstrap API token` has no generator — operators must boot a worker,
   scrape stdout, then paste. Valid for `launch-local` but painful for
   manual `docker run` / hand-rolled compose.
3. Engine picker in the per-worker config editor lists every `EngineKind`
   (http / mcp / cli / claude-code / acp / codex / cursor) with no visual
   indication of whether the CLI is actually installed / authenticated in
   that worker's container.

FEAT-011..016 (PLAN-007) intentionally deferred availability-probe UX —
FEAT-013's subtask report flagged it as follow-up, and FEAT-015's notes
repeated the same. PLAN-008 is the dedicated lane.

## Proposal

Two FEATs, independent delivery lanes:

### FEAT-017 — Register dialog UX polish (P1, frontend + docs)

- Base URL placeholder → `http://aiworker-worker:3000`; inline helper text;
  `?` tooltip linking to a new `docs/deployment.md` subsection enumerating
  the three valid shapes.
- `Generate` button next to the Bootstrap API token field: client-side
  `crypto.getRandomValues` → `wtk_` + 44-char base62 → writes to field +
  shows `AIWORKER_FORCE_TOKEN=<token>` helper block.
- Shared utility `generateWorkerApiToken()` in
  `packages/shared/src/fleet/worker.ts` with unit test asserting output
  always satisfies the existing `WORKER_API_TOKEN_PATTERN`.
- No backend change; token remains opaque to the manager.

### FEAT-018 — Engine availability discovery (P1, worker + proxy + frontend)

- `apps/api/src/worker/executor/availability.ts` lifts ACP's per-agent
  probe into a shared module, extends coverage to claude-code / codex /
  cursor / http / mcp / cli.
- `GET /api/worker/engines` (bearer-auth'd) returns `{ engines:
  AvailabilityInfo[] }` for all `EngineKind`, 10-minute cache.
- Dashboard proxies with the existing transparent proxy — manager-side
  code unchanged (PLAN-004 data-domain boundary preserved).
- Frontend: `useWorkerEngines(workerId)` hook + picker badges
  (`ready / login required / missing`).
- Missing engines stay clickable; variant panel shows install instructions
  linking to new `docs/executor-engines.md`.

## Risks

1. **Client-side RNG trust (FEAT-017)** — `crypto.getRandomValues` is CSPRNG
   quality in modern browsers. Token never leaves dashboard → browser →
   operator clipboard → worker env. Acceptable.
2. **`AIWORKER_FORCE_TOKEN` only honoured on first worker boot (FEAT-017)**
   — if the operator generates a token for a worker that already ran once,
   the env var is ignored and registration will fail. Helper text must
   call this out explicitly.
3. **Auth probe is mtime-only (FEAT-018)** — can't distinguish "expired
   login" from "valid login". Badge language must reflect this honestly
   (`login required` means "no auth file found", not "auth is broken").
4. **Probe shell-outs must stay cheap (FEAT-018)** — `claude --version`
   network-checks under `--dangerously-skip-permissions` = problematic.
   Prefer filesystem-only probes; defer `--version` to on-demand refresh.
5. **Cache invalidation (FEAT-018)** — a 10-minute cache means "just logged
   in" won't show until refresh. Expose a `?refresh=1` query param and a
   UI "Refresh" button per-engine.

## Scope

- FEAT-017: ~150 LOC + 1 shared util + 1 docs section. 1 PR, local delivery
  (no BKD dispatch — too small for worktree overhead).
- FEAT-018: ~500 LOC across worker (new module + route), frontend (hook +
  badge UI), and `docs/executor-engines.md`. 1 PR, BKD worktree dispatch.

Out of scope:

- Active token validation (actually calling the CLI). FEAT-018 settles for
  file-presence heuristics, matching vibe-kanban/bkd.
- Central manager-side engine registry / caching. PLAN-004 boundary stays
  intact: each worker answers for itself.
- Auto-install of missing CLIs. Link to install docs; don't shell out npm.

## Alternatives

### Alternative A — Inline the token generator into the register mutation

Have the frontend call a new `POST /api/workers/bootstrap-token` that
returns a server-generated token. Upside: one code path, server RNG.
Downside: extra endpoint, extra round-trip, and the token would then need
to be stored or kept in memory server-side until the worker actually comes
online — which is exactly the state we removed in PLAN-004 (manager no
longer persists unverified tokens). **Rejected.**

### Alternative B — Probe every CLI via `docker exec` from the manager

Have the manager shell into each worker container. Upside: one central
cache. Downside: breaks the PLAN-004 data-domain boundary (manager would
need exec access and knowledge of worker internals). **Rejected.**

### Alternative C — Merge FEAT-017 + FEAT-018 into one PR

Upside: one deploy. Downside: FEAT-017 is trivially reversible frontend
copy; FEAT-018 touches worker DB/route logic. Keep them independent so
FEAT-017 can ship to users ahead of FEAT-018's more careful roll-out.
**Rejected.**

## Annotations

- 2026-04-23 05:00 — User approved via `proceed both` after seeing the
  Phase 2 proposal.
