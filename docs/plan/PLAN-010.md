# PLAN-010 Manager-driven worker creation + dashboard authN + quota

- **status**: completed
- **createdAt**: 2026-04-23 09:10
- **approvedAt**: 2026-04-23 09:15
- **completedAt**: 2026-04-23 09:55
- **relatedTask**: FEAT-023

## Context

### C1 — Backend launch capability is already in place

- `FleetSupervisor.launchLocal` at `apps/api/src/dashboard/supervisor/service.ts:135` is feature-complete: allocates a free port, mints a fresh per-worker master key (`randomBytes(32)`, line 157), runs the container with the 4 bootstrap envs, polls `docker logs` for the one-shot `AIWORKER_BOOTSTRAP_TOKEN` line, renders `baseUrl` from `AIWORKER_LAUNCH_BASE_URL_TEMPLATE` (default `http://{containerName}:3001`), and returns the admission triple.
- `POST /api/workers/launch-local` is mounted at `apps/api/src/dashboard/registry/routes.ts:298`, conditional on `canLaunch && supervisor`. Handler launches then calls `registerWorker(..., { addedBy: 'launch-local' })` in-band.
- Config gate `MANAGER_CAN_LAUNCH=false` by default (`apps/api/src/config/dashboard.ts:21`), plus `superRefine` forces 4 envs (`AIWORKER_IMAGE`, `WORKER_DATA_ROOT`, `WORKER_MEMORY_LIMIT`, `WORKER_CPU_LIMIT`) when the flag is on.
- Frontend `apps/web/src` has **zero** uses of launch-local (`grep -r launch-local apps/web` returns nothing).

### C2 — Dashboard authN: zero coverage, one free dependency

- No `/api/*` middleware exists. `apps/api/src/modes/dashboard.ts:41` mounts `buildRegistryRoutes(...)` directly after `requestLogger` + `errorHandler`.
- `INTERNAL_SHARED_SECRET` is **defined** (`apps/api/src/config/common.ts:9`, min 16 chars), **injected** into the dashboard container (`ops/compose/docker-compose.yml:22`) and copied into every launch-local worker env (`apps/api/src/dashboard/supervisor/service.ts:113`), but **never consumed** by dashboard app code.
- `apps/api/src/worker/management/bearer-auth.ts:23-39` is a 40-line hono middleware using `timingSafeEqualStrings`. Trivially adaptable — the worker version pulls its token from `getIdentity()` for rotation; dashboard only needs a static `INTERNAL_SHARED_SECRET`.
- Frontend `apps/web/src/lib/api.ts:18` funnels every call through a single `request(method, path, body)` function — one injection site covers the whole SPA.
- Caddy at `ops/caddy/Caddyfile.tmpl` is a pure `:80 → 127.0.0.1:3000` reverse proxy; no header injection, no basic-auth. CLAUDE.md line 107 explicitly anticipates "后续加入 bearer 中间件消费 `INTERNAL_SHARED_SECRET`" — this plan fulfills that intent.

### C3 — Quota: no existing counter

- `listWorkers()` at `apps/api/src/dashboard/registry/service.ts:145` is `.select().from(registeredWorkers).all()` — `.length` on the result is the cheapest correct count. Drizzle's `sql\`COUNT(*)\`` is overkill for a table that will hold ≤ dozens of rows.
- `MANAGER_MAX_WORKERS` is not defined anywhere.

### C4 — Single-host topology gaps

- Production `ops/compose/docker-compose.yml` defines **only** the dashboard service: no `docker.sock` bind mount, no `networks` block. Meaning: to enable launch-local today an operator has to edit production compose anyway.
- Both `ops/compose/.env.example` and `docker-compose.yml` are silent on launch-related envs (`AIWORKER_IMAGE`, `WORKER_DATA_ROOT`, `WORKER_MEMORY_LIMIT`, `WORKER_CPU_LIMIT`, `MANAGER_CAN_LAUNCH`).
- `docs/deployment.md:37` mentions `INTERNAL_SHARED_SECRET` only as a length constraint; no runbook for the launch-local flow.
- `FleetSupervisor.launchLocal` does **not** verify the dashboard container itself is joined to `AIWORKER_NETWORK`. If the operator enables the flag without also joining the network, the rendered `http://{containerName}:3001` baseUrl is unreachable from the manager → every `info()` probe 502s until compose is fixed.

### C5 — UI reuse surface

- `apps/web/src/features/workers/components/register-wizard.tsx` has the canonical form pattern (field validation, error mapping via `WorkerApiError.code`, one-time token display, success step with `Go to config`). Structure can be lifted wholesale for a `CreateWizard`, with different fields and different server contract.
- `apps/web/src/features/workers/hooks.ts` houses `useRegisterWorker`, `useUpdateWorker`, etc. `useLaunchWorker` should slot in next to `useRegisterWorker`.
- `WorkerApiErrorCode` at `apps/web/src/lib/api.ts:145` is an exhaustive union — extend with `'quota-exceeded' | 'launch-timeout' | 'launch-failed' | 'auth-required'`.

### C6 — `INTERNAL_SHARED_SECRET` leakage risk

A browser-side token requires special handling. Three viable shapes:

- **Shape α (recommended for MVP)**: make the dashboard middleware accept **both** `Authorization: Bearer <INTERNAL_SHARED_SECRET>` and `Authorization: Basic base64(user:<INTERNAL_SHARED_SECRET>)`, and return `WWW-Authenticate: Basic realm="AIWorker"` on 401. The browser handles Basic natively — the SPA frontend requires zero auth-specific code. CI / scripts use Bearer. Both routes consume the same shared secret; no new storage.
- **Shape β**: Caddy `basic_auth` directive only. Zero backend changes, but mixing Bearer for CI later is awkward; and the compose overlay + Caddyfile change has to ship atomically with the dashboard code change, making rollback fiddly.
- **Shape γ**: proper `/login` + session cookie + user DB. Out of scope for MVP; future work when multi-operator support lands.

Shape α is chosen. Details in Proposal §P1.

## Proposal

Six workstreams, ordered by dependency.

### P1 — Dashboard bearer/basic middleware (P0, gate)

Files touched:

- **NEW** `apps/api/src/dashboard/middleware/auth.ts` — hono `MiddlewareHandler` that:
  - Reads `Authorization` header; returns `401 { error: { code: 'auth-required' } }` + `WWW-Authenticate: Basic realm="AIWorker"` if missing/malformed.
  - Accepts `Bearer <token>` where `token === INTERNAL_SHARED_SECRET` (timing-safe).
  - Accepts `Basic base64(user:pass)` where `pass === INTERNAL_SHARED_SECRET` (user is ignored — one shared credential, no user model yet).
  - Reuses `timingSafeEqualStrings` from `apps/api/src/worker/secrets/crypto.ts`. Do **not** refactor that helper into `shared/`; the CLAUDE.md constraint forbids cross-boundary deduplication of crypto.
- **EDIT** `apps/api/src/modes/dashboard.ts`:
  - Mount the new middleware on `/api/*` *before* `buildRegistryRoutes`.
  - Keep `/health`, `/openapi.json`, `/docs`, and `serveStatic('*')` unauthenticated. Achieve this by mounting the middleware on `app.use('/api/*', …)` rather than `app.use('*', …)`.

Frontend: no change needed. Browsers will pop the native Basic prompt on first navigation once `WWW-Authenticate` is returned; subsequent requests auto-include the Basic header. For SSE / fetch via `request()` the browser credential cache handles it.

Tests:

- **NEW** `apps/api/src/dashboard/middleware/auth.test.ts` — 6 cases: missing, malformed, Bearer ok, Bearer wrong, Basic ok, Basic wrong.
- **EDIT** existing route tests that bypass middleware today (`dashboard/registry/routes.test.ts`) — inject a stub header or mount routes without the middleware; verify no regression.

### P2 — Capabilities endpoint

- **EDIT** `apps/api/src/dashboard/registry/routes.ts`: add `GET /capabilities` (unguarded within the registry sub-app — still behind the `/api/*` middleware) returning:
  ```ts
  { canLaunch: boolean, maxWorkers: number | null, currentWorkers: number }
  ```
  `canLaunch` from `options.canLaunch && !!options.supervisor`; `maxWorkers` from `dashboardConfig.MANAGER_MAX_WORKERS`; `currentWorkers` from `listWorkers().length`.
- Rationale: the UI needs to decide button-disabled state + preview the quota headroom before rendering the Create wizard; trial-and-error via 404 on `/launch-local` is a worse UX.

### P3 — Quota check

- **EDIT** `apps/api/src/config/dashboard.ts`: add `MANAGER_MAX_WORKERS: z.coerce.number().int().positive().optional()`. Optional means "no cap" when unset.
- **EDIT** `apps/api/src/dashboard/registry/service.ts`: add `countWorkers(): number` → `getFleetDb().select({ id: registeredWorkers.id }).from(registeredWorkers).all().length`. (Literal count query in drizzle-orm adds sql-template noise; row id only is cheap enough at fleet scales.)
- **EDIT** `apps/api/src/dashboard/registry/routes.ts`: before `supervisor.launchLocal(…)` at line 315 *and* before `registerWorker(…)` at line 117, check `maxWorkers !== undefined && countWorkers() >= maxWorkers` → return `409 { error: { code: 'quota-exceeded', limit: maxWorkers, current: ... } }`.
- Idempotence / race: two concurrent launches can both pass the check and both register — acceptable given single-operator MVP and slow docker-run path. Tightening requires a DB-level constraint or a mutex; out of scope.

### P4 — Supervisor self-check (defence-in-depth)

- **EDIT** `apps/api/src/dashboard/supervisor/service.ts`:
  - In `ensureInfrastructure()` (currently line 94), after `docker.ping()` and `ensureNetwork(…)`, probe: `docker inspect` the container whose id is the dashboard's own `hostname` (docker sets `HOSTNAME=<12 hex>` for non-networked containers). If the probe shows the dashboard is **not** a member of `AIWORKER_NETWORK`, throw `LaunchFailedError('dashboard container is not joined to network X — update compose to attach it')` at launch time.
  - Soft-fail if `HOSTNAME` isn't a container id (dev / non-docker run): skip the check, emit a `consola.warn`.
- This keeps the "enabled the flag but forgot the network" failure mode from silently producing zombie registered workers whose every poll returns unreachable.
- If the self-check is too invasive for v1, fall back to **only** the documentation change in §P5; flag this subtask as optional during code review.

### P5 — Deployment overlay + runbook

- **EDIT** `ops/compose/docker-compose.yml`:
  - Keep default deploy unchanged (socket *not* mounted, network *not* defined) to preserve the safe default.
  - Document inline with a commented-out block showing exactly how to enable launch-local: add `volumes: /var/run/docker.sock:/var/run/docker.sock:ro` and `networks: [aiworker_default]` + env flags.
  - Alternative: publish a `docker-compose.supervisor.yml` overlay invoked via `docker compose -f … -f docker-compose.supervisor.yml up -d`. Recommended — less merge noise on the base file and explicit opt-in.
- **EDIT** `ops/compose/.env.example`: append the 5 launch envs + `MANAGER_MAX_WORKERS` with explanatory comments.
- **EDIT** `docs/deployment.md`: new section "Enabling manager-driven worker creation" with:
  1. Security preamble (docker.sock = root; authN must be enabled first).
  2. Required envs checklist.
  3. Compose overlay snippet.
  4. Smoke test: `curl -u :$INTERNAL_SHARED_SECRET https://.../api/workers/capabilities` should return `canLaunch: true`.
  5. Rollback: unset `MANAGER_CAN_LAUNCH`, restart.

### P6 — Frontend Create wizard

Files touched:

- **EDIT** `packages/shared/src/fleet/registered-worker.ts` (if applicable) — no type changes expected; `SafeRegisteredWorker` already covers the launch-local response.
- **EDIT** `apps/web/src/lib/api.ts`:
  - Extend `WorkerApiErrorCode` union with `'quota-exceeded' | 'launch-timeout' | 'launch-failed' | 'auth-required'`.
  - Add `launchWorker(input: { displayName: string, forceId?: string }): Promise<SafeRegisteredWorker & { apiToken?: string }>` — pointing to `POST /api/workers/launch-local`. **See API change below**.
  - Add `getCapabilities(): Promise<DashboardCapabilities>`.
- **EDIT** `apps/api/src/dashboard/registry/routes.ts` (launch-local response): on 201, return the full row **plus** the freshly-minted plaintext `apiToken` so the UI can show it once. Today the handler strips it (line 337 onwards). The token already lives encrypted in fleet.db; surfacing it once for UI display matches the "GitHub PAT" UX the operator expects and aligns with the UI success step plan. Document clearly that this is a one-time surface only.
  - Alternative: omit the token. Operators can rotate via the existing rotate-token path to get a new one. Less friction in the code but worse UX on day one. Recommend surfacing once.
- **EDIT** `apps/web/src/features/workers/hooks.ts`:
  - `useLaunchWorker()` — `useMutation<SafeRegisteredWorker & { apiToken?: string }, WorkerApiError, LaunchWorkerInput>` mirroring `useRegisterWorker`'s invalidation pattern.
  - `useDashboardCapabilities()` — `useQuery` keyed `['dashboard-capabilities']`, 30 s stale time.
- **NEW** `apps/web/src/features/workers/components/create-wizard.tsx` — modeled on `register-wizard.tsx`:
  - Step 1: `displayName` required (≤80 chars); collapsible Advanced with `forceId` (regex-validated).
  - Step 2: pending state with time estimate ("this usually takes 10-30 seconds") and explicit cancellation note.
  - Step 3: success panel showing `workerId` / `baseUrl` / **one-time `apiToken`** (copy-to-clipboard, with "won't be shown again" warning) + `Go to config` primary.
  - Error map covers `quota-exceeded` (with current/limit from capabilities), `launch-timeout`, `launch-failed`, `auth-required`.
- **EDIT** `apps/web/src/features/workers/components/workers-list.tsx`:
  - Add a `Create worker` primary button next to the existing `Register` action.
  - Button `disabled` when `capabilities.canLaunch === false`; tooltip explains `MANAGER_CAN_LAUNCH=true + 4 envs required`.
  - If `currentWorkers >= maxWorkers`, disable with tooltip "quota reached".

Tests:

- **NEW** `apps/web/src/features/workers/__tests__/create-wizard.test.tsx` — mirrors `register-wizard.test.tsx` (already present): happy path, quota-exceeded, launch-timeout, validation error.
- **EDIT** `apps/web/src/features/workers/__tests__/workers-list.test.tsx` — assert button enabled/disabled branches.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Basic-auth + single shared secret = zero user tracking / audit attribution. Anyone with the secret can do anything. | Accept for MVP (operator-only deploy). Flag §P1 doc that future multi-user work needs a real session/user model. |
| R2 | Browser caches Basic credentials until the tab is closed, and some browsers show no clean "log out" UI. | Document; recommend private windows for demo / handover. Future session-based auth resolves this. |
| R3 | `docker.sock` mount = host root escalation. Once §P1 is merged, anyone who gets past authN is root on the host. | Treat §P1 as a hard blocker: do **not** ship §P5 overlay enabling launch to production until P1 has passed review and has tests green. |
| R4 | Dashboard container forgot-to-join `aiworker_default` — launched workers unreachable. | §P4 self-check raises loud error at launch time. §P5 runbook spells it out. |
| R5 | Quota race: two concurrent launches bypass the check. | Accepted (launches are seconds-long, single operator expected). Not worth a mutex; the `docker run` step serialises on the daemon anyway. |
| R6 | One-time token surface (§P6) — if the operator closes the dialog without copying, the token is gone (only the encrypted form remains). | Explicit warning in Success step. Rotate-token flow still works for recovery. |
| R7 | 401 with `WWW-Authenticate: Basic` breaks non-browser clients (smoke-plan-004, deploy scripts) that don't supply auth. | Audit `apps/api/scripts/smoke-plan-004.ts` + `scripts/deploy.ts` for calls into `/api/workers/*`; add the header. Expect a small patch, not a rewrite. |
| R8 | Supervisor self-check (§P4) is brittle if `HOSTNAME` isn't a container id (dev / non-docker). | Soft-fail to warn + proceed; only hard-fail when `docker inspect` succeeds and shows the wrong network. |
| R9 | `MANAGER_MAX_WORKERS` enforcement applied in-process — if two dashboard replicas ever run against the same fleet.db (not currently supported), the counter isn't distributed. | Out of scope; single-dashboard is a PLAN-004 assumption anyway. |
| R10 | Rolling out §P1 to the live test host (`gateway.example.test`) will immediately 401 the web UI until `scripts/deploy.ts` ships the new `.env` with `INTERNAL_SHARED_SECRET` re-exposed to the browser. | Sequencing: ship behind a feature flag `DASHBOARD_REQUIRE_AUTH` defaulted **off**, flip after deploy. Alternative: single-deploy — accept ~1 minute of UI auth prompt as the operator reloads; documented in the deploy record. Recommend the feature flag for less coordination risk. |
| R11 | Launch-local container cleanup on failure — existing code has `removeContainer({ force: true })` on the failure path but doesn't clean the `WORKER_DATA_ROOT/<name>` directory. A re-launch of the same displayName could reuse orphaned state. | Out of scope; open FEAT-024 follow-up if it bites. Not introduced by this plan. |

## Scope

| Layer | New | Edit | Tests |
|---|---|---|---|
| Backend middleware | `dashboard/middleware/auth.ts` (~50 LOC) | `modes/dashboard.ts` (+5 LOC) | `auth.test.ts` (~80 LOC) |
| Backend capabilities + quota | — | `config/dashboard.ts` (+2 LOC), `registry/service.ts` (+10 LOC), `registry/routes.ts` (+40 LOC) | `routes.test.ts` (+60 LOC) |
| Supervisor self-check | — | `supervisor/service.ts` (+40 LOC) | `supervisor/service.test.ts` (+40 LOC) |
| Frontend API + hooks | — | `lib/api.ts` (+30 LOC), `features/workers/hooks.ts` (+25 LOC) | — |
| Frontend wizard + list | `create-wizard.tsx` (~220 LOC) | `workers-list.tsx` (+40 LOC) | `create-wizard.test.tsx` (~250 LOC), `workers-list.test.tsx` (+30 LOC) |
| Deploy / docs | — | `ops/compose/docker-compose.yml` (+20 LOC comment), `ops/compose/docker-compose.supervisor.yml` (new overlay, ~30 LOC), `.env.example` (+10 LOC), `docs/deployment.md` (+80 LOC) | — |
| Script fixes (R7) | — | `apps/api/scripts/smoke-plan-004.ts`, `scripts/deploy.ts` probe calls (~10 LOC total) | — |

Total: ~1050 LOC of which ~460 LOC is tests. Estimate 1.5 days wall clock for a focused implement session, including the test pass + local smoke.

## Alternatives

| Decision | Chosen | Alternative | Why not |
|---|---|---|---|
| AuthN shape | Basic + Bearer (α) | Caddy basic_auth only (β) | β requires compose + Caddyfile change to ship atomically with any API change; Bearer for CI later is ugly. |
| AuthN shape | Basic + Bearer (α) | Cookie session + `/login` (γ) | Real user model + DB schema + CSRF; 10× the effort, zero MVP value. |
| Create UI entry | Dedicated button | Tab inside Register dialog | Register and Create have disjoint field sets; tabbing confuses "which URL do I type where?" |
| Quota enforcement | In-process `.length` count | DB trigger / unique constraint on row count | SQLite doesn't do row-count constraints; a trigger is more code for no extra correctness at this scale. |
| Self-check (§P4) | Startup + launch-time inspect | Periodic reconciliation loop | A loop duplicates the poller; the single-shot check catches the common misconfig case. |
| One-time token surface | Show in wizard success step | Never surface, force rotate-token to retrieve | Worse first-run UX. Token is already generated; showing it once is no incremental leak. |

## Annotations

(No annotations yet — awaiting review.)
