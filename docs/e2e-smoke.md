# PLAN-004 end-to-end smoke

`apps/api/scripts/smoke-plan-004.ts` is a self-contained `bun` script that proves the full PLAN-004 story works without docker, LINE credentials, or an OpenAI key. It boots a worker process and a manager process side-by-side, then walks the operator journey: bootstrap → register → configure → rotate token → web-channel echo.

## Prerequisites

- `bun` on `$PATH` (developed against 1.3.x).
- A working tree with deps installed at the repo root: `bun install`.
- Two free localhost ports (the script picks ephemeral ports automatically — nothing to set up).

## Run

```bash
cd apps/api
bun run scripts/smoke-plan-004.ts
```

Exit code:

- `0` — every step passed.
- `1` — an assertion failed; the offending step + response body is printed to stderr.
- `2` — uncaught exception (most likely a process-spawn failure). Stack is printed.

## Expected output (trimmed)

```
[smoke] booting worker process
[smoke] worker  ready: id=w_xxxxxxxxxxxx url=http://127.0.0.1:NNNNN
[smoke] booting manager process
[smoke] manager ready: http://127.0.0.1:NNNNN
[smoke] step 1: POST /api/workers/register
[smoke]         ok — id=w_xxxxxxxxxxxx lastSeenState=online
[smoke] step 2: GET /api/workers
[smoke]         ok — workers=[w_xxxxxxxxxxxx]
[smoke] step 3: PUT /api/workers/:id/proxy/worker/config
[smoke]         ok — runtimeReload=ok version=2
[smoke] step 4: GET /api/workers/:id/proxy/worker/info
[smoke]         ok — configVersion=2 web-channel=enabled
[smoke] step 5: POST /api/workers/:id/rotate-token (manager wrapper)
[smoke]         ok — rotatedAt=2026-04-21T... lastFour=XXXX
[smoke] step 6: GET /info again — proves manager re-encrypted the new token
[smoke]         ok — post-rotate proxy still authenticates
[smoke] step 7: POST /api/workers/:id/proxy/worker/channels/web/test (echo)
[smoke]         ok — channels/web/test sent=true
[smoke] all steps passed — PLAN-004 5.1 smoke PASS
[smoke] shutting down worker
[smoke] shutting down manager
```

## What each step verifies

| Step | Endpoint | Asserts |
|---|---|---|
| 1 | `POST /api/workers/register` | manager validates the bearer against worker `/info`, persists the row, returns `lastSeenState=online`. |
| 2 | `GET /api/workers`           | the new row is listed with the correct id. |
| 3 | `PUT /proxy/worker/config`   | full `WorkerConfig` round-trips through the manager pass-through, hot reload returns `ok`, version bumps to `2`. |
| 4 | `GET /proxy/worker/info`     | worker reports the new `configVersion` + the `web` channel as enabled. |
| 5 | `POST /:id/rotate-token`     | the new manager-side wrapper rotates the bearer AND re-encrypts it into `registered_workers.apiTokenEnc`. |
| 6 | `GET /proxy/worker/info`     | after rotation, the proxy still authenticates — proves step 5 actually updated the registry's stored token. |
| 7 | `POST /proxy/worker/channels/web/test` | the configured `web` channel binding accepts the echo + adapter returns `sent: true`. |

## Why no docker / LINE round-trip

The original 5.1 dispatch sketched a docker-based bare-worker boot + LINE webhook signature round-trip. The script-based variant trades the docker dependency for a bun subprocess pair, and replaces LINE (which needs real channel credentials and an outbound HTTPS hop to the LINE platform) with the `web` channel, whose adapter is internal-only and therefore safe to exercise from a smoke without real platform creds. The same code paths — channel binding, `runtime.channels.get(...)`, adapter `send()` — execute either way.

A docker variant can be added later by having the script `docker run` an `aiworker-runtime:dev` container instead of `bun src/index.ts`; the assertion list above stays the same.

## Cleanup

The script cleans up its own temp directories (under `$TMPDIR/aiworker-smoke-plan-004-*`). On crash, leftovers are safe to `rm -rf` — they only contain ephemeral SQLite files.
