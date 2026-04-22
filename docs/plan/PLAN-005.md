# PLAN-005 aissh-driven fleet deployment automation

- **status**: completed
- **createdAt**: 2026-04-21 18:00
- **approvedAt**: 2026-04-21 18:10
- **completedAt**: 2026-04-21 18:30
- **relatedTask**: FEAT-009

## Context

### Deploy target

- Server `aiwork` (aissh id `<aissh-server-id-redacted>`, host `<test-server-ip-redacted>`, public DNS `gateway.example.test`).
- Ubuntu 24.04, 1 vCPU / 961 MiB RAM / 25 GB disk, Caddy already on `:80/:443`.
- Legacy state: `aiworker.service` systemd unit + `/opt/aiworker` source deploy from REFACTOR-001. No docker installed. Must tear down before the new runtime boots.

### Post-PLAN-004 deploy shape

PLAN-004 replaced the "dashboard spawns docker workers" model with **self-sufficient workers + manager-as-registry**. Practical consequences for FEAT-009:

1. First cut of the fleet deploy is **dashboard-only** — the manager is a pure registry until operators register workers. No `MANAGER_CAN_LAUNCH`, no docker socket mount.
2. Health endpoints are **`/health`** on both modes (not `/api/system/health` from the FEAT-009 task draft). Use `/health` for deploy verification.
3. Caddy no longer needs to strip `{workerId}/` — workers own their externally-reachable URL (`AIWORKER_ADVERTISED_BASE_URL`). The first-cut Caddyfile only fronts the dashboard; per-worker routing is operator-decided at worker register time.
4. `AIWORKER_MASTER_KEY` (32-byte hex) is **required** for the dashboard — it seals `registered_workers.apiTokenEnc`. Must be minted once and kept out of the repo.

### Existing artifacts

- `Dockerfile` (root) — multi-stage, single image for both modes. Reuse.
- `docker-compose.yml` (root) — dev orchestration (local `build: .`, ephemeral master key, docker socket mounted for `launch-local` experiments). Not suited for prod.
- `apps/api/scripts/smoke-plan-004.ts` — reference style for a Bun-based ops script (spawn subprocesses, parse stdout, run assertions).
- No `scripts/` at repo root yet; no `ops/` directory yet; no `docs/deployment.md`.

### aissh surface used

- `aissh exec <server_id> "<cmd>" --reason="..."` — sync shell. High-risk commands trigger approval; caller then `aissh approval wait <op-id>`. Output is JSON on stdout.
- `aissh file upload <server_id> <local> --remote-path=<path> --reason="..."` — one-shot upload, limit 3 GB.
- All commands support `AISSH_SERVER` / `AISSH_TOKEN` env overrides; no interactive prompts.

## Proposal

### Deliverables

```
ops/
├── caddy/
│   └── Caddyfile.tmpl              # dashboard-only template
└── compose/
    ├── docker-compose.yml          # production compose (dashboard, pinned image)
    └── .env.example                # required host env (master key, internal secret)
scripts/
└── deploy.ts                        # Bun CLI wrapping aissh
docs/
└── deployment.md                    # run book
```

### 1. `ops/compose/docker-compose.yml`

Dashboard-only production compose. Reads env from a host-local `.env` (operator-managed, not in repo). Image tag is a required env var so rollbacks are a compose-var swap.

```yaml
name: aiworker

services:
  dashboard:
    image: aiworker-runtime:${AIWORKER_IMAGE_TAG}
    container_name: aiworker-dashboard
    restart: unless-stopped
    ports:
      - '127.0.0.1:3000:3000'          # Caddy on host forwards here
    environment:
      AIWORKER_MODE: dashboard
      NODE_ENV: production
      PORT: 3000
      FLEET_DB_PATH: /var/lib/aiworker/fleet.db
      FLEET_MIGRATIONS_FOLDER: /app/drizzle/fleet
      AIWORKER_MASTER_KEY: ${AIWORKER_MASTER_KEY}
      INTERNAL_SHARED_SECRET: ${INTERNAL_SHARED_SECRET}
      MANAGER_POLL_INTERVAL_MS: '30000'
      MANAGER_POLL_JITTER_MS: '3000'
      # MANAGER_CAN_LAUNCH intentionally omitted (defaults to false)
    volumes:
      - aiworker_fleet:/var/lib/aiworker

volumes:
  aiworker_fleet:
    name: aiworker_fleet
```

No networks stanza, no docker.sock mount (dashboard is a pure registry in first cut).

### 2. `ops/caddy/Caddyfile.tmpl`

One-site template. Placeholders filled by `scripts/deploy.ts` before upload; no Caddy import of extra files.

```caddy
gateway.example.test {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
	log {
		output file /var/log/caddy/aiw.access.log
	}
}
```

No per-worker blocks in v1. When operators register workers, they set `AIWORKER_ADVERTISED_BASE_URL` to whatever reverse-proxy topology they choose (subdomain, path, or separate host).

### 3. `scripts/deploy.ts`

Bun CLI with explicit subcommands. Each subcommand is idempotent and narrowly scoped; `deploy` chains the common happy path.

```
bun run scripts/deploy.ts <command> [flags]

Commands:
  install-docker    Install docker on the target host (first-time only, approval-gated)
  teardown-legacy   Stop aiworker.service, remove /opt/aiworker, remove unit file
                    (IRREVERSIBLE, approval-gated, requires --confirm)
  build             bun run build + docker build + docker save → ./ops/dist/aiworker-<tag>.tar
  upload            aissh file upload image tarball + compose + Caddyfile to /opt/aiworker-deploy/
  install           docker load + docker compose up -d (on host, via aissh exec)
  verify            aissh exec curl -fsS http://127.0.0.1:3000/health (asserts status == 'ok')
  reload-caddy      Copy Caddyfile to /etc/caddy/, caddy validate, systemctl reload caddy
  deploy            build → upload → install → verify → reload-caddy (no install-docker/teardown)

Flags:
  --tag=<tag>       Image tag (default: git short sha + "-" + UTC yyyymmddhhmm)
  --server=<id>     aissh server id (default: AIWORK_SERVER_ID env or hardcoded aiwork id)
  --reason=<text>   aissh --reason value (default: "FEAT-009 deploy <command>")
  --dry-run         Print the aissh commands without executing
  --confirm         Required for teardown-legacy
```

Implementation notes:

- Pure `Bun.spawn` over `aissh`; no extra deps.
- Approval loop: when `aissh exec` returns a payload with `{ approval: { id } }`, the script calls `aissh approval wait <id> --timeout=600` and re-runs the original command once on `approved`.
- `.env` on the host: kept at `/opt/aiworker-deploy/.env`, operator-owned, **never touched by the script** (script refuses to overwrite it). `install` reads it via `docker compose --env-file`.
- Rollback: operator sets `AIWORKER_IMAGE_TAG=<previous-tag>` in `/opt/aiworker-deploy/.env` and reruns `install`. Script does **not** delete old image tarballs from the host (keeps last N = 3 manually is documented in the run book).
- Verify step fails hard if `/health` returns non-ok — caller must roll back manually.

### 4. `docs/deployment.md`

Run book with sections:

1. Prereqs (mint `AIWORKER_MASTER_KEY`, populate `/opt/aiworker-deploy/.env`, ensure DNS points to host).
2. First-time deploy: `install-docker` → `teardown-legacy --confirm` → `deploy`.
3. Routine deploy: `bun run scripts/deploy.ts deploy` (+ optional `--tag`).
4. Rollback: edit `AIWORKER_IMAGE_TAG` in host `.env`, rerun `install`.
5. Worker registration (pointer to PLAN-004 section, not repeated here).

### 5. Task / changelog sync

- `FEAT-009` → in_progress when claimed, completed on merge.
- `docs/changelog.md` gets a dated `[release]` entry summarising what FEAT-009 adds + noting the deviation from the original FEAT-009 task wording (dashboard-only v1, `/health` not `/api/system/health`, no Caddy prefix-stripping).

## Risks

1. **Destructive teardown of `/opt/aiworker`.** Mitigation: `teardown-legacy` requires `--confirm`, always triggers aissh approval, and runs *after* the new dashboard container has booted and `/health` reports ok (explicit ordering in the run book, not enforced by script — documented explicitly).
2. **Lost `AIWORKER_MASTER_KEY`.** Without it, the manager cannot decrypt `registered_workers.apiTokenEnc` → every registered worker becomes unreachable. Mitigation: run book instructs the operator to back it up in the org secret store before first deploy; script refuses to run `install` if the env file is missing the key.
3. **Tight RAM (961 MiB).** Mitigation: build image locally, not on host. `docker save | zstd` keeps tarball under ~150 MB.
4. **aissh approval latency blocks the script.** Mitigation: approvals only for `install-docker` (once) and `teardown-legacy` (once). Steady-state `deploy` does *not* require approval.
5. **Caddy reload fails.** Mitigation: `reload-caddy` runs `caddy validate` before `systemctl reload`; on validate failure it aborts without touching the live config.
6. **v1 scope omits worker deploy.** Acceptable: PLAN-004 made workers operator-registered, not script-deployed. Worker-provisioning automation is follow-up (FEAT-008 or a future plan).

## Scope

- 6 new files (2 ops templates, 1 deploy script, 1 run book, 1 plan, 1 env example).
- 0 existing code changes — `Dockerfile` and root `docker-compose.yml` stay as dev assets.
- Task index + plan index + changelog updates.

Estimated diff: ~450 LOC for `deploy.ts`, ~80 LOC for compose + Caddy + .env.example, ~150 LOC for deployment.md.

## Alternatives

1. **Registry pull instead of tarball upload.** Simpler operationally once a registry exists, but the project has no registry and setting one up is out of scope for FEAT-009. Keep tarball for v1; switch to registry when multi-host HA (FEAT-008) arrives.
2. **Ansible / Terraform.** Overkill for one server. Would fight aissh's approval gating.
3. **GitHub Actions CI deploy.** No CI is wired up yet; adding one is FEAT-scale work on its own. A local `bun run scripts/deploy.ts` command is the minimum viable path.
4. **Include worker containers in the first-cut compose.** Rejected — PLAN-004 deliberately decoupled worker deployment from the manager. Baking worker services into the compose would re-couple them.
5. **Put compose at `ops/compose/docker-compose.prod.yml` instead of `docker-compose.yml`.** Equivalent; chose the shorter name under a scoped directory.

## Annotations

- 2026-04-21 18:10 — User replied `proceed` with no annotations. Moving to implementing.
