# AIWorker Deployment

End-to-end run book for getting the AIWorker dashboard onto `gateway.example.test`.

The tooling assumes the default target (aissh server `aiwork`,
`<aissh-server-id-redacted>`, `<test-server-ip-redacted>`). Set
`AIWORK_SERVER_ID` or pass `--server=<id>` to retarget.

## Prerequisites

Local workstation:

- `bun` (same version used for development)
- `docker` (client + engine, used for `docker build` / `docker save`)
- `zstd` (used to compress the image tarball)
- `aissh` CLI, already authenticated (`aissh status` should succeed)
- `git` (used to derive the default image tag)

Target host (done once, via the first-time deploy below):

- Ubuntu 24.04, ≥ 25 GB disk, docker + `docker compose` plugin
- Caddy v2 as a system service (`systemctl status caddy`)
- Directory `/opt/aiworker-deploy/` owned by root, containing a filled-in `.env`

## Required host-local `.env`

Copy `ops/compose/.env.example` to `/opt/aiworker-deploy/.env` on the host and
fill in every value **before** running `install`:

- `AIWORKER_MASTER_KEY` — 32-byte hex. **Back this up in your org secret store
  before first deploy.** Losing it bricks every registered worker's stored
  bearer token; you will not be able to recover by redeploying.
- `INTERNAL_SHARED_SECRET` — ≥ 16 chars.
- `AIWORKER_IMAGE_TAG` — last known-good tag. The deploy script overrides this
  inline when running; this value only matters for manual `docker compose up
  -d` on the host (e.g. after a reboot).

`scripts/deploy.ts install` refuses to run if the file or the two required
secrets are missing.

## First-time deploy

Run once, in order, from a clean repo checkout on your workstation:

```sh
# 1. Install docker on the host. Triggers aissh approval.
bun run scripts/deploy.ts install-docker

# 2. Verify aissh can reach the host and docker works.
#    (run the dry-run first to see what the script will ask for)
bun run scripts/deploy.ts deploy --dry-run

# 3. Build, upload, install, verify, and reload Caddy.
bun run scripts/deploy.ts deploy

# 4. Only after /health returns ok: tear down the legacy runtime.
#    IRREVERSIBLE. Triggers aissh approval.
bun run scripts/deploy.ts teardown-legacy --confirm
```

After step 3 succeeds, edit `/opt/aiworker-deploy/.env` on the host and set
`AIWORKER_IMAGE_TAG=<the tag printed by the script>` so manual compose
invocations also see the right image.

## Routine deploy

```sh
bun run scripts/deploy.ts deploy
```

Equivalent to:

1. `build` — `bun run build`, `docker build -t aiworker-runtime:<tag> .`,
   `docker save | zstd` to `ops/dist/aiworker-<tag>.tar.zst`.
2. `upload` — `aissh file upload` of tarball + `docker-compose.yml` +
   `Caddyfile.tmpl` to `/opt/aiworker-deploy/`.
3. `install` — `aissh exec` runs `zstd -d`, `docker load`, then
   `AIWORKER_IMAGE_TAG=<tag> docker compose --env-file .env up -d`.
4. `verify` — `aissh exec curl -fsS http://127.0.0.1:3000/health` asserts
   `status == ok`.
5. `reload-caddy` — `caddy validate` + `systemctl reload caddy`.

Use `--tag=<tag>` to pin a specific tag (otherwise `<git-sha>-<UTC timestamp>`).

## Rollback

Find a previous tag (list tarballs in `ops/dist/` locally or
`docker image ls aiworker-runtime` on the host), then:

```sh
bun run scripts/deploy.ts install --tag=<previous-tag>
bun run scripts/deploy.ts verify
```

If the previous image is already loaded on the host, `install` is fast — no
re-upload is needed. If the tarball isn't locally stashed, re-run `build` with
the previous tag (you'll need the matching source checkout) or pull it from
your image archive.

Update `AIWORKER_IMAGE_TAG` in the host `.env` once the rollback is verified
so manual compose invocations stay aligned.

## Worker registration

Workers are self-sufficient (PLAN-004). They run wherever you like — same host
via a separate compose, different VM, another cloud — and the dashboard
registers them by URL + bootstrap token. See
[PLAN-004](plan/PLAN-004.md#operator-flow) for the registration walkthrough.
FEAT-009 does **not** automate worker deployment; that is follow-up work.

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
deviates in three places:

1. Health endpoint is `GET /health`, not `GET /api/system/health`.
2. The Caddyfile does not strip a `{workerId}` prefix — PLAN-004 made workers
   advertise their own externally-reachable URL.
3. First-cut deploy brings up the dashboard only; workers are operator-
   registered after the dashboard is healthy.
