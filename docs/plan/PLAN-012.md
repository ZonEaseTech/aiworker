# PLAN-012 Filesystem source of truth for brain + skills + memory

- **status**: completed
- **createdAt**: 2026-04-24 12:30
- **revisedAt**: 2026-04-24 15:45
- **approvedAt**: 2026-04-24 15:45
- **completedAt**: 2026-04-24 16:30
- **relatedTask**: REFACTOR-003

## Revision note (2026-04-24 15:45)

**The original PLAN-012 — "mechanical move of `apps/api/src/worker/**` into `packages/core`" — is superseded.** Post-phase-1a research on Hermes + OpenClaw (see `docs/changelog.md` 2026-04-24 entry) confirmed that aiworker's current shape is already the `fleet (control plane) + worker (runtime)` split that OpenClaw RFC 42026 proposes, and that the real gap vs. the CLI-first / agent-daemon pattern lies elsewhere: **data-domain source of truth, remote-control protocol, envelope normalisation, and execution agency**. The mechanical move becomes PLAN-015; it is the last step, not the next one.

User decisions (2026-04-24 15:30):

- **A1** — filesystem is the source of truth for skills + memory; SQLite becomes index + transient runtime state.
- **Hermes moat** — keep evolution observer / proposer; no detour into formal-capability sandboxing.
- **C1** — one worker container = one agent. No per-process multi-agent routing yet.
- **D1** — WS gateway fully replaces dashboard REST; web UI and manager CLI rewired. **Break API; no migration concern** (pre-production).
- Legacy code can be wiped wholesale.

## Context

### C1 — Current brain layer is already fs-flavoured, just not owned

- `apps/api/src/worker/brain/providers/hermes.ts` uses `scanMemories(home)` / `scanSkills(home)` and `Bun.write(filePath, ...)` under `home`. The fs I/O is already the real implementation path.
- `HermesProvider` additionally constructs a `HermesApiClient` pointing at `HERMES_API_URL`. The only call that actually hits the API is `health()` — everything else reads/writes the filesystem. The API dependency is therefore vestigial.
- The home directory is external: `~/.hermes/` by default (see `apps/api/.env.example:6`). aiworker does not own the layout, cannot evolve it, and cannot ship skills alongside the runtime without fighting another project's conventions.

### C2 — The shared config types still use `'hermes'` as a discriminator

- `packages/shared/src/fleet/config.ts:19-21` declares `BrainSourceConfig = { type: 'hermes', ... } | { type: 'cloud-gateway', ... }`.
- Renaming `'hermes'` → `'filesystem'` (and `HermesProvider` → `FilesystemBrainProvider`) is a narrow type swap — no data migration because pre-production.
- The `cloud-gateway` source stays as a secondary / optional remote KB (ZoneaseTech internal), not touched by this plan.

### C3 — Legacy env surface is growing mold

- `.env.example` still advertises `HERMES_API_URL` / `HERMES_HOME` (used) and `OPENCLAW_WS_URL` / `OPENCLAW_HOME` (unused legacy, kept "for transitional compatibility").
- `docs/architecture.md` explicitly notes: "Legacy `OPENCLAW_WS_URL` / `OPENCLAW_HOME` remain in the env schema for transitional compatibility; they are not consumed ..."
- User decision lets us delete all of these in one pass.

### C4 — The target layout (Hermes-shaped, aiworker-owned)

```
~/.aiworker/
  workers/
    <workerId>/
      AGENT.md            # persona / role document (openclaw-shaped)
      SOUL.md             # voice / style guidelines (openclaw-shaped)
      USER.md             # user profile the agent maintains
      config.yaml         # redacted worker config (future: source of truth; phase 1 only mirrors DB for diff)
      brain/
        MEMORY.md         # human-readable index (existing convention)
        memories/*.md     # individual memory notes (agent-created)
        skills/<name>/
          SKILL.md        # agentskills.io progressive-disclosure doc
          reference/...   # optional deep references loaded on demand
      worker.db           # SQLite: identity + transient runtime + FTS index
      worker.db-wal
      worker.db-shm
      workspaces/         # per-conversation ephemeral workspaces (git worktree or plain dir)
      logs/               # consola spool (future)
```

Rationale:

- **`brain/` subdirectory** isolates the agentskills.io-compatible surface from aiworker internals (`worker.db`, `workspaces/`). Skills from the community `skills.sh` / `agentskills.io` taps can be dropped straight in; no translation layer.
- **`AGENT.md` / `SOUL.md` / `USER.md`** match OpenClaw's persona convention. Phase 1 just creates stubs; the orchestrator can inject their content into the system prompt in PLAN-014 (envelope upgrade has a companion prompt assembly change).
- **`config.yaml` is a mirror in this plan**, not the source of truth yet. The worker writes it on every `putConfig` call so operators can read current state by `cat config.yaml`. The DB row remains authoritative because the optimistic-lock contract (`If-Match: <version>`) depends on it. Moving config to yaml-as-truth is a separate PLAN once WS gateway + `aim config` CLI land (PLAN-013).

### C5 — Existing flow does not need to change

- `BrainProvider` interface (`listSkills`, `listMemories`, `searchMemories`, `writeMemory`, `watch`, `health`) stays identical. The swap is purely which class implements it.
- `MultiBrainProvider` (fan-out + priority) is reused.
- Existing FEAT-006 evolution observer + proposer keep writing to `skillDrafts` in `worker.db`. Their write into `brain/skills/*` during `approve` happens via the same `BrainProvider.writeMemory` path (already fs-backed).
- Channel adapters, orchestrator, executor engines: untouched.

## Proposal

Four workstreams. All pre-D1 (dashboard + web are still HTTP until PLAN-013).

### P1 — New package `@aiworker/fs-layout`

Small leaf package (~100 LOC) that owns the home-directory resolution logic. Exports:

- `resolveAiworkerHome(): string` — reads `AIWORKER_HOME` env, falls back to `~/.aiworker`.
- `resolveWorkerHome(workerId: string): string` — `<home>/workers/<workerId>`.
- `resolveBrainHome(workerId: string): string` — `<workerHome>/brain`.
- `resolveSkillsDir(workerId)`, `resolveMemoriesDir(workerId)`, `resolveMemoryIndexPath(workerId)`, `resolveWorkspacesRoot(workerId)`.
- `ensureWorkerHome(workerId): Promise<void>` — `mkdir -p` the skeleton (brain/, workspaces/, seed `AGENT.md` / `SOUL.md` / `USER.md` if absent).

Rationale for a dedicated package: the WS gateway (PLAN-013), the CLI (`apps/cli`), the web static assets serving, and tests all need the same resolver. Putting it in `packages/shared` would pull `node:fs` / `node:os` into a package that was type-only until now.

### P2 — Rename + rehome the brain provider

- Delete `apps/api/src/adapters/hermes/api-client.ts` (sole use was `HermesProvider.health`; replace with an `access(brainHome)` probe).
- Move `apps/api/src/adapters/hermes/{fs-scanner,watcher,types,index}.ts` → `apps/api/src/worker/brain/providers/filesystem/*`. These are the actual scan + watch + type surface; they're not Hermes-specific despite the path name.
- Rename class `HermesProvider` → `FilesystemBrainProvider` in `apps/api/src/worker/brain/providers/filesystem.ts`.
- Constructor drops `apiUrl`; takes only `home` (a path).
- `health()` becomes: `access(home)` → `healthy` / `down`. Remove `HermesApiClient` import.
- Factory (`apps/api/src/worker/brain/factory.ts`) swaps `type === 'hermes'` → `type === 'filesystem'`.

### P3 — Shared types + env + default config

- `packages/shared/src/fleet/config.ts`:
  - Rename `HermesBrainSourceConfig` → `FilesystemBrainSourceConfig`.
  - Drop `apiUrl` field.
  - `home` becomes optional; when absent, factory uses `resolveBrainHome(workerId)`.
  - Discriminator `'hermes'` → `'filesystem'` in `BrainSourceConfig`.
- `packages/shared/src/index.ts` + `fleet/index.ts`: update re-exports.
- `apps/api/src/worker/bootstrap/default-config.ts` (or wherever the seed lives): seed brains with `{ type: 'filesystem', config: { home: <resolved> } }` instead of `{ type: 'hermes', config: { apiUrl, home } }`.
- Delete ENV entries from `apps/api/.env.example`: `BRAIN_PROVIDER`, `HERMES_API_URL`, `HERMES_HOME`, `OPENCLAW_WS_URL`, `OPENCLAW_HOME`. Also delete any zod-schema entries that validate these in `apps/api/src/config/worker.ts` (grep pass will find them; likely none since they migrated to WorkerConfig).
- Add ENV entry: `AIWORKER_HOME=~/.aiworker` (optional).

### P4 — Ensure + mirror on bootstrap

- `apps/api/src/worker/bootstrap/` gains `ensureBrainHome.ts` which calls `ensureWorkerHome(workerId)` as part of `loadOrMintIdentity`.
- `apps/api/src/worker/management/config.ts::putConfig` gains a post-persist hook: write the (redacted) config as YAML to `<workerHome>/config.yaml`. This is the forward-looking mirror for PLAN-013 / aim CLI.
- No DB schema change in this plan. `worker_config.config_json` stays authoritative.

### Acceptance criteria

- `bun run check` clean.
- `bun run --filter '@aiworker/api' test` — 450 pass. Any test that mocks `HermesProvider` or stubs the Hermes API client is updated; no new failures.
- `bun run --filter '@aiworker/cli' smoke:aiw-run` still PASS against a freshly-created `~/.aiworker/workers/<id>/` layout.
- `aiw init` → creates the fs skeleton; `ls ~/.aiworker/workers/<id>/` shows `brain/` + `config.yaml` + `AGENT.md` + `SOUL.md` + `USER.md` + `worker.db`.
- `aiw config-set '{...}'` mirrors to `config.yaml` on success.
- `.env.example` shrinks (five deleted entries, one added).
- No file imports `HERMES_API_URL`, `HERMES_HOME`, `OPENCLAW_WS_URL`, `OPENCLAW_HOME`, `HermesProvider`, `HermesApiClient` (verified by grep in CI).
- `docs/architecture.md` + `docs/cli.md` + `apps/api/.env.example` all reflect the new layout.

### Scope

- **New files**: `packages/fs-layout/{package.json,tsconfig.json,src/index.ts}` + `apps/api/src/worker/brain/providers/filesystem/*` (moved).
- **Moved files**: `apps/api/src/adapters/hermes/{fs-scanner,watcher,types,index}.ts` → `apps/api/src/worker/brain/providers/filesystem/`.
- **Renamed**: `HermesProvider` → `FilesystemBrainProvider` (class + file).
- **Deleted**: `apps/api/src/adapters/hermes/api-client.ts`, `apps/api/src/adapters/hermes/` (once empty).
- **Edited**: `packages/shared/src/fleet/config.ts` (+ re-exports), `apps/api/src/worker/brain/factory.ts`, `apps/api/src/worker/bootstrap/default-config.ts`, `apps/api/src/worker/bootstrap/identity.ts` (ensure home), `apps/api/src/worker/management/config.ts` (yaml mirror), `apps/api/.env.example`, `docs/architecture.md`, `docs/cli.md`, `docs/changelog.md`.
- **Out of scope**: WS gateway, dashboard deletion, per-tool approvals, provider fallbacks, cron, envelope upgrade, `packages/core` extraction. All in later plans.

### Verification

- `grep -r HERMES_ apps packages` → zero hits.
- `grep -r HermesProvider apps packages` → zero hits.
- `grep -r OPENCLAW_ apps packages` → zero hits.
- `aiw init` on a clean tmpdir produces the exact tree in C4.
- Web UI / dashboard unchanged (still HTTP; PLAN-013 breaks these).

## Risks

- **R1 (P1)** Rename sweeps can miss a deeply-nested `.test.ts` mock that still expects `HermesProvider`. Mitigation: grep for each deleted symbol before merging.
- **R2 (P2)** Operators running existing dev deploys have `HERMES_API_URL` in their `.env`. Deletion makes those envs silently ignored rather than error. Mitigation: a one-liner warning in changelog + `.env.example` diff is authoritative.
- **R3 (P2)** Skills that currently live in `~/.hermes/skills/` are invisible post-switch. Explicit non-goal: no automatic migration (pre-production). The changelog will instruct operators to copy skills into `~/.aiworker/workers/<id>/brain/skills/` manually if they care.
- **R4 (P3)** Writing `config.yaml` on every `putConfig` adds a small write. If the worker crashes mid-write, the yaml can fall out of sync with the DB. Mitigation: yaml is advisory this phase; the DB is still authoritative.

## Alternatives considered

- **A — DB-only, no fs change** (original PLAN-012). Rejected per user A1.
- **B — Yaml is source of truth now** (aggressive). Rejected for phase scope: the optimistic-lock contract depends on DB version; changing that needs a separate plan after WS gateway lands so operators have a tool to edit yaml safely.
- **C — Move immediately into `packages/core`** (merge PLAN-012 + PLAN-015). Rejected: core extraction is mechanical and churns imports across many files; doing it at the same time as a semantic rename (HermesProvider → FilesystemBrainProvider) doubles review cost.

## Decision

Approved path above. Awaiting execution.
