# AIWorker Deployment

End-to-end run book for getting the AIWorker dashboard onto `gateway.example.test`.

The tooling assumes the default target (aissh server `aiwork`,
`<aissh-server-id-redacted>`, `<test-server-ip-redacted>`). Set
`AIWORK_SERVER_ID` or pass `--server=<id>` to retarget.

## Prerequisites

Local workstation:

- `bun` (same version used for development)
- `aissh` CLI, already authenticated (`aissh status` should succeed)
- `gh` CLI, logged in with `workflow` + `write:packages` scopes (used to
  trigger the build workflow and to stamp the host's GHCR login)
- `git` (used to derive the default image tag)

Target host (done once, via the first-time deploy below):

- Ubuntu 24.04, ≥ 25 GB disk, docker + `docker compose` plugin
- Caddy v2 as a system service (`systemctl status caddy`), with
  `/var/log/caddy/aiw.access.log` owned by the `caddy` user
- Directory `/opt/aiworker-deploy/` owned by root, containing a filled-in
  `.env`
- `/root/.docker/config.json` carrying GHCR credentials — `scripts/deploy.ts
  login-ghcr` stamps them in (reuses your local `gh auth token`)

## Required host-local `.env`

Copy `ops/compose/.env.example` to `/opt/aiworker-deploy/.env` on the host and
fill in every value **before** running `install`:

- `AIWORKER_MASTER_KEY` — 32-byte hex. **Back this up in your org secret store
  before first deploy.** Losing it bricks every registered worker's stored
  bearer token; you will not be able to recover by redeploying.
- `INTERNAL_SHARED_SECRET` — ≥ 16 chars.
- `AIWORKER_IMAGE_TAG` — last known-good tag published to
  `ghcr.io/zoneasetech/aiworker`. The deploy script overrides this inline when
  running; this value only matters for manual `docker compose up -d` on the
  host (e.g. after a reboot).

`scripts/deploy.ts install` refuses to run if the file or the two required
secrets are missing.

## First-time deploy

Run once, in order, from a clean repo checkout on your workstation:

```sh
# 1. Install docker on the host. Triggers aissh approval.
bun run scripts/deploy.ts install-docker

# 2. Stamp GHCR credentials into /root/.docker/config.json on the host.
#    Uses `gh auth token` from the operator's workstation.
bun run scripts/deploy.ts login-ghcr

# 3. Dry-run the deploy to see what the script will ask for.
bun run scripts/deploy.ts deploy --dry-run

# 4. Trigger the build workflow, upload compose + Caddyfile + .env,
#    docker compose pull + up -d, verify /health, reload Caddy.
bun run scripts/deploy.ts deploy

# 5. Only after /health returns ok: tear down the legacy runtime.
#    IRREVERSIBLE. Requires --confirm.
bun run scripts/deploy.ts teardown-legacy --confirm
```

After step 4 succeeds, edit `/opt/aiworker-deploy/.env` on the host and set
`AIWORKER_IMAGE_TAG=<the tag printed by the script>` so manual compose
invocations also see the right image.

## Routine deploy

```sh
bun run scripts/deploy.ts deploy
```

Equivalent to:

1. `build` — `gh workflow run build-image.yml --ref main -f tag=<tag>` and
   `gh run watch` until the run exits 0. The workflow publishes
   `ghcr.io/zoneasetech/aiworker:<tag>` (plus `:latest`) via buildx.
2. `upload` — `aissh file upload` of `docker-compose.yml`, `Caddyfile.tmpl`,
   and `.env` to `/opt/aiworker-deploy/` (each with an explicit filename —
   aissh sftp PUT rejects trailing-slash targets).
3. `install` — `aissh exec` runs
   `AIWORKER_IMAGE_TAG=<tag> docker compose --env-file .env pull && up -d`.
4. `verify` — `aissh exec curl -fsS http://127.0.0.1:3000/health` asserts
   `status == ok`.
5. `reload-caddy` — `caddy validate` + `systemctl reload caddy`.

Use `--tag=<tag>` to pin a specific tag (otherwise `<git-sha>-<UTC timestamp>`).

## Rollback

List prior tags on GHCR
(`gh api /orgs/zoneasetech/packages/container/aiworker/versions`) or on the
host (`docker image ls ghcr.io/zoneasetech/aiworker`), then:

```sh
bun run scripts/deploy.ts install --tag=<previous-tag>
bun run scripts/deploy.ts verify
```

If the previous image is still cached on the host, `install` is near-instant —
`docker compose pull` is a no-op and `up -d` recreates the container in
seconds. Otherwise compose pulls the tag over the network.

Update `AIWORKER_IMAGE_TAG` in the host `.env` once the rollback is verified
so manual compose invocations stay aligned.

## Worker registration

Workers are self-sufficient (PLAN-004). They run wherever you like — same host
via a separate compose, different VM, another cloud — and the dashboard
registers them by URL + bootstrap token. See
[PLAN-004](plan/PLAN-004.md#operator-flow) for the registration walkthrough.
FEAT-009 does **not** automate worker deployment; that is follow-up work.

### Worker base URL formats

The Register dialog's `Base URL` is the dashboard → worker HTTP endpoint. It
must be the worker's HTTP root: scheme + host/port, **no trailing path**. The
dashboard concatenates `/api/worker/info`, `/api/worker/config`, etc. on top.

| Topology | Example `Base URL` |
|---|---|
| Dashboard and worker share a docker compose network | `http://aiworker-worker:3000` |
| Worker on a different host, fronted by HTTPS reverse proxy | `https://worker-1.example.com` |
| Worker on a different host, reachable by direct port | `http://<test-server-ip-redacted>:3001` |

Notes:

- The dashboard always connects server-side (not through the operator's
  browser), so internal docker hostnames resolve fine.
- `http` vs `https` just has to match what the worker actually serves.
- Do not include `/api/worker` or any suffix — if registration fails with
  `worker-unreachable`, a stray path is a common cause.

### Bootstrap token options

The Register dialog accepts a `wtk_`-prefixed token that must match the
worker's live `worker_identity`. Two ways to obtain one:

1. **Let the worker mint its own**: start the worker container with no
   `AIWORKER_FORCE_TOKEN`; on first boot it generates a token and prints it
   once to stdout. Copy it from `docker logs <worker-container>` and paste
   it into the dashboard.
2. **Have the dashboard mint it** (FEAT-017): click **Generate** in the
   Register dialog — a CSPRNG produces a compliant token in the browser.
   Set `AIWORKER_FORCE_TOKEN=<token>` on the worker container *before its
   first boot* (e.g. add it to the worker compose `environment:` block).
   The worker will then use exactly that token instead of minting its own.
   `AIWORKER_FORCE_TOKEN` is a one-shot knob — it is ignored when the
   worker already has a `worker_identity` row.

## Slim vs Full image (FEAT-020)

Every `build-image` workflow run publishes **two tags** to
`ghcr.io/zoneasetech/aiworker`:

| Tag | Size | Content |
|---|---|---|
| `<sha>` (slim, default) | ~150 MB | No agentic CLIs baked in. Workers fall back to `npx -y ...` at first use (30–60s cold start). |
| `<sha>-full` | ~300 MB | Slim + `npm install -g` for `@anthropic-ai/claude-code`, `@openai/codex`, `@google/gemini-cli`, `@qwen-code/qwen-code`, pinned to the same defaults the TS source uses (`DEFAULT_*_CLI_VERSION`). Cursor is **not** included (see FEAT-021). |

Pick per deploy:

```bash
# Default — slim.
bun scripts/deploy.ts deploy --tag=$TAG

# Full, so workers don't pay the npx cold-start each first use.
bun scripts/deploy.ts deploy --tag=$TAG --image-variant=full
```

Switching without a rebuild: edit `/opt/aiworker-deploy/.env` on the host
so `AIWORKER_IMAGE_VARIANT_SUFFIX=` (slim) or `=-full`, then re-run
`scripts/deploy.ts install --tag=<same tag>`.

**Auth files never ship in the image** — pre-installing the CLI only
skips the binary fetch. First login still happens at container run-time
(either a one-off `docker exec claude login` or a host auth-dir mount).
See [`docs/executor-engines.md`](./executor-engines.md) per engine for
login paths and mount recipes.

## Troubleshooting

- `aissh exec` prints an operation id and `approval required`: run
  `aissh approval wait <op-id>` in another terminal, then re-run the failed
  subcommand.
- `verify` fails: `aissh exec <server> "docker logs aiworker-dashboard --tail
  200"` — check whether the dashboard actually started, and whether the host
  `.env` has a valid `AIWORKER_MASTER_KEY`.
- `reload-caddy` fails `caddy validate`: edit `ops/caddy/Caddyfile.tmpl`
  locally, re-run `bun run scripts/deploy.ts deploy` (or `upload` +
  `reload-caddy` if the image is unchanged).

## Deviations from the original FEAT-009 draft

The FEAT-009 task file was authored before PLAN-004. This run book intentionally
deviates in five places:

1. Health endpoint is `GET /health`, not `GET /api/system/health`.
2. The Caddyfile does not strip a `{workerId}` prefix — PLAN-004 made workers
   advertise their own externally-reachable URL.
3. First-cut deploy brings up the dashboard only; workers are operator-
   registered after the dashboard is healthy.
4. Images are built in `.github/workflows/build-image.yml` and published to
   `ghcr.io/zoneasetech/aiworker` (private). The host does
   `docker compose pull`, not `docker load` of an uploaded tarball — the
   original PLAN-005 rejected CI deploy as "FEAT-scale work"; the workstation
   docker build path turned out brittle enough to flip that call.
5. The dashboard container serves the bundled web SPA itself via
   `hono/bun.serveStatic` at `/app/web` with an index.html SPA fallback. Caddy
   is a pure `:80 → 127.0.0.1:3000` reverse proxy; TLS is terminated by
   Cloudflare's orange-cloud proxy on `gateway.example.test`.
