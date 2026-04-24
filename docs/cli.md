# AIWorker CLI — `aiw`

`aiw` is the worker-side CLI that ships with `@aiworker/cli`. It drives the same worker runtime that `AIWORKER_MODE=worker` drives, but it does not require binding an HTTP port — so you can step through the conversation loop from a shell, a script, or CI.

This is phase-1a of PLAN-011 / REFACTOR-003. The manager-side CLI (`aim`) and the WebSocket gateway live in later phases.

## Installation (dev)

Bun workspace. No separate install step today — invoke directly:

```sh
bun apps/cli/src/aiw.ts <subcommand> [options]
```

Or via the workspace script:

```sh
bun run --filter '@aiworker/cli' smoke:aiw-run   # phase-1 success demo
```

Phase-1b will add a `bun build --compile` step and publish a single `aiw` binary per OS/arch.

## Environment

`aiw` shares the worker-mode env (`apps/api/.env.example`). The minimum required for anything beyond `--help` / `--version`:

- `AIWORKER_MASTER_KEY` — 32-byte hex, encrypts the secrets vault.
- `WORKER_DB_PATH` — path to the per-worker SQLite file (default `/var/lib/aiworker/worker.db`).

Optional but commonly set:

- `AIWORKER_HOME` — root of the per-worker filesystem tree; defaults to `~/.aiworker`. `aiw init` materialises `<home>/workers/<workerId>/` with `AGENT.md` / `SOUL.md` / `USER.md` / `brain/` / `workspaces/` (see `docs/architecture.md`).
- `WORKER_MIGRATIONS_FOLDER` — defaults to the package-embedded path resolved from `@aiworker/storage-sqlite` via `import.meta.url`, which works when running from source. Override if you vendored migrations elsewhere.
- `AIWORKER_FORCE_ID` / `AIWORKER_FORCE_TOKEN` — pin the identity during tests / replay.

## Subcommands

### `aiw init`

Materialise `worker.db`, run migrations, mint identity + token on first boot, seed a default config, and create the `~/.aiworker/workers/<workerId>/` filesystem tree (`AGENT.md` / `SOUL.md` / `USER.md` / `brain/skills/` / `brain/memories/` / `workspaces/`). Idempotent — re-running does not reprint the bootstrap token and will not overwrite any existing seed files.

```sh
aiw init
# → prints (once):
# [worker] id=w_xxxxxxxxxxxx
# [worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_...
# [worker] save this token; it will not be printed again.
```

### `aiw run --message <text> [--chat-id <id>] [--dry-run] [--timeout-ms <n>]`

Feed one envelope through the orchestrator without binding any HTTP port. Streams every `WorkerEventBus` event to stdout as NDJSON and exits once the orchestrator reaches a terminal state (`orchestrator.task.succeeded` / `.failed` / `.cancelled`).

```sh
aiw run --message "hello"
# stdout:
# {"type":"channel.inbound","at":"...","payload":{...}}
# {"type":"conversation.message","at":"...","payload":{...}}
# {"type":"orchestrator.task.succeeded","at":"...","payload":{...}}
```

- `--dry-run` — bootstrap everything, then exit without ingesting the envelope. Useful for CI smoke: proves the runtime can be constructed offline with zero HTTP.
- `--timeout-ms` — hard ceiling in ms; exits 124 if no terminal event arrives. Default 120000.

Exit codes: 0 success, 1 task failed, 2 bad arguments, 124 timeout.

### `aiw serve [--port <n>]`

Start the existing worker HTTP surface. Bit-for-bit equivalent of `AIWORKER_MODE=worker bun src/index.ts`: same bootstrap, same routes, same hot-reload contract, same `/openapi.json` + `/docs`. Use when you want the full HTTP API (registry proxy, webhook endpoints, SSE stream).

```sh
aiw serve --port 3001
```

### `aiw config-show`

Print the stored (redacted) worker config as JSON, plus its monotonic version.

```sh
aiw config-show
# {
#   "version": 1,
#   "config": { ... }
# }
```

### `aiw config-set <json> [--if-match <version>]`

Replace the stored worker config. Payload shape matches the dashboard `PUT /api/worker/config` body. The `--if-match` guard triggers the same optimistic-concurrency check the HTTP surface uses — reject unless the stored version equals the expected version. On success, the redacted config is also mirrored to `~/.aiworker/workers/<workerId>/config.yaml` (advisory — the DB row stays authoritative).

```sh
aiw config-set "$(cat new-config.json)" --if-match 1
# → [aiw config set] stored config v2
```

Exit codes: 0 success, 2 invalid JSON or validation failure, 3 version conflict.

### `aiw token-rotate`

Mint a new API token, encrypt it under the master key, overwrite `worker_identity.api_token_enc`, and print the plaintext once.

```sh
aiw token-rotate
# [aiw token rotate] worker w_xxxxxxxxxxxx token rotated
# wtk_NEWTOKENHERE
```

The previous token is invalid immediately. Save the new token before using it; there is no way to recover it from storage.

## Exit code conventions

Across all subcommands:

- `0` — operation succeeded.
- `1` — operation failed (task error, rotate write error, ...).
- `2` — invalid arguments (missing `--message`, malformed JSON, validation failure).
- `3` — domain-specific conflict (e.g. `config-set` version mismatch).
- `124` — timeout.

## Phase-1 scope caveats

- Subcommand names are flat with dashes (`config-show`, `config-set`, `token-rotate`) because `cac` — the argv parser — does not support space-separated sub-subcommands (`aiw config show`). Phase 1b may replace `cac` with a hand-rolled dispatcher or switch to nested commands if the UX cost matters.
- `aiw run` defaults to channel `web` with chat id `cli:stdin`. More channels (Telegram / Lark / WhatsApp) don't make sense from the CLI today — they're webhook-driven, `aiw serve` is the right entry for that.
- There is no `aiw repl` (interactive loop) yet. `aiw run` is one-shot.
- There is no `aim` (manager-side CLI) yet. Dashboard-driven workflows still run through `AIWORKER_MODE=dashboard` + HTTP.
