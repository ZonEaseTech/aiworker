# AIWorker env single-item evidence ledger

Date: 2026-06-07

This ledger audits the variables currently present in root `.env.example`.
The standard is not "the string exists in code"; the standard is:

1. A supported project-dev entry starts through `bun run` or Bun.
2. Bun loads root `.env`.
3. The value is inherited by the shell/script/process chain.
4. A concrete startup/runtime path reads the value.

Direct probe:

```text
bun direct: from-dotenv
bash direct: missing
```

Current development probes:

```text
bun run dev:env:check
[env:check] env structure ok (/Users/ben/projects/aiworker/.env.example <-> /Users/ben/projects/aiworker/.env)

bun run dev:status
[dev:status] AIWORKER_HOME=/Users/ben/.aiworker-dev
[dev:status] api: http://127.0.0.1:9217

bun run dev:host:status
"manifestPath": "/Users/ben/.aiworker-dev/dev-host.json"
```

## Scope Legend

- `root-dev`: root `.env.example` and ignored `.env`.
- `worker-dev`: source checkout Worker scripts, mainly `dev:worker`, `dev:status`, `dev:clean`, `dev:web`, `dev:apps`.
- `worker-runtime`: Worker daemon/runtime config schema and app bootstrap.
- `worker-daemon-package`: `packages/worker-daemon/.env.example` direct daemon subset.
- `host-dev`: Host source dev lifecycle scripts.
- `host-cli`: Host CLI lifecycle, status, prod serve, or session auth setup.
- `fleet-dev`: multi-Soul local dev harness.
- `cli-shim`: packaged npm/bunx shell shim, not source `bun run dev:*`.
- `provisioning`: provisioned Worker check-in and Worker Access tunnel path.
- `engine-invocation`: local native engine command invocation.
- `byok`: BYOK provider secret reference lookup.

## Active Root Variables

### AIWORKER_HOME

- Scope: `root-dev`, `worker-dev`, `worker-runtime`, `fleet-dev`, `worker-daemon-package`.
- Purpose: root AIWorker home. Source dev defaults to `~/.aiworker-dev`; packaged CLI defaults to `~/.aiworker`.
- Root example: `.env.example:11`.
- Package subset: `packages/worker-daemon/.env.example:5`.
- Load chain: `package.json:19`, `package.json:20`, `package.json:30`, `package.json:31`, `package.json:33`, `package.json:34` start through `bun run dev:env:check && ...`, so root `.env` is loaded by Bun before shell/TS entry execution.
- Read chain: `scripts/dev-local.sh:6`, `scripts/dev-status.sh:6`, `scripts/dev-clean.sh:7`, `scripts/dev-apps.sh:6`, `scripts/dev-fleet-web.ts:165`, `packages/fs-layout/src/index.ts:52`, `apps/worker-cli/src/aiworker.ts:410`.
- Runtime proof: `bun run dev:status` printed `AIWORKER_HOME=/Users/ben/.aiworker-dev`.
- Limitation: fleet CLI deliberately unsets ambient `WORKER_DB_PATH` but keeps `AIWORKER_HOME` as the fleet root.

### AIWORKER_HOST

- Scope: `root-dev`, `worker-dev`, `host-dev`, `fleet-dev`.
- Purpose: shared local bind host for source dev scripts.
- Root example: `.env.example:14`.
- Package subset: no.
- Load chain: root dev entries are Bun package scripts in `package.json:19`, `package.json:23`, `package.json:33`.
- Read chain: `scripts/dev-local.sh:7`, `scripts/dev-host.sh:6`, `scripts/dev-fleet-web.ts:224`, `scripts/dev-fleet-web.ts:557`, `scripts/dev-fleet-web.ts:601`.
- Runtime effect: Worker Web and Host Web bind URLs derive from this value in `scripts/dev-local.sh:157`, `scripts/dev-host.sh:125`, and fleet Vite restart paths.
- Limitation: `AIWORKER_WEB_HOST` overrides host only for standalone `dev:web`; `dev:worker` uses `AIWORKER_HOST`.

### AIWORKER_WORKER_HOST

- Scope: `root-dev`, `worker-dev`, `worker-runtime`, `worker-daemon-package`.
- Purpose: Worker daemon bind host.
- Root example: `.env.example:17`.
- Package subset: `packages/worker-daemon/.env.example:7`.
- Load chain: `package.json:28` passes it into `dev:worker-daemon`; `scripts/dev-local.sh:8` derives it from `AIWORKER_HOST` when unset.
- Read chain: `packages/worker-runtime/src/config/worker.ts:14`, `apps/worker-cli/src/aiworker.ts:1105`, `apps/worker-cli/src/aiworker.ts:1419`, `apps/worker-cli/src/aiworker.ts:1469`.
- Runtime effect: daemon bind/check URL uses this value.
- Limitation: in `dev:worker`, the printed URL uses `AIWORKER_HOST` for the script-level URL; daemon foreground itself reads `AIWORKER_WORKER_HOST` through runtime config.

### PORT

- Scope: `root-dev`, `worker-dev`, `worker-runtime`, `worker-daemon-package`.
- Purpose: Worker daemon port.
- Root example: `.env.example:20`.
- Package subset: `packages/worker-daemon/.env.example:6`.
- Load chain: `package.json:28`, `scripts/dev-local.sh:9`, `scripts/dev-status.sh:8`, `scripts/dev-clean.sh:8`.
- Read chain: `packages/worker-runtime/src/config/worker.ts:13`, `apps/worker-cli/src/aiworker.ts:1106`, `apps/worker-cli/src/aiworker.ts:1421`, `apps/worker-cli/src/aiworker.ts:1470`, `packages/worker-daemon/src/modes/worker.ts:734`.
- Runtime proof: `bun run dev:status` printed listener check for port `9217`.
- Limitation: Host dev ports use `AIWORKER_HOST_API_PORT` and `AIWORKER_HOST_WEB_PORT`, not `PORT`.

### AIWORKER_WEB_HOST

- Scope: `root-dev`, standalone `worker-dev`.
- Purpose: Worker Web Vite host for `bun run dev:web`.
- Root example: `.env.example:24`.
- Package subset: no.
- Load chain: `package.json:29` starts `dev:web` through Bun and passes `--host ${AIWORKER_WEB_HOST:-127.0.0.1}`.
- Read chain: `package.json:29`.
- Runtime effect: only affects standalone Worker Web dev server.
- Limitation: `scripts/dev-local.sh` does not read this value; `dev:worker` uses `AIWORKER_HOST` for Worker Web at `scripts/dev-local.sh:157`.

### AIWORKER_WEB_PORT

- Scope: `root-dev`, `worker-dev`.
- Purpose: Worker Web Vite port.
- Root example: `.env.example:25`.
- Package subset: no.
- Load chain: `package.json:29`, `scripts/dev-local.sh:10`, `scripts/dev-status.sh:9`, `scripts/dev-clean.sh:9`.
- Read chain: `scripts/dev-local.sh:157`, `scripts/dev-local.sh:201`, `scripts/dev-local.sh:303`, `scripts/dev-local.sh:313`, `scripts/dev-status.sh:29`, `scripts/dev-clean.sh:71`.
- Runtime proof: `bun run dev:status` printed listener check for port `5173`.
- Limitation: fleet uses fixed per-Soul Vite ports from `scripts/dev-fleet-web.ts`, not this variable.

### AIWORKER_API_URL

- Scope: `root-dev`, `worker-dev`.
- Purpose: Worker Web API target and dev healthcheck URL.
- Root example: `.env.example:28`.
- Package subset: no.
- Load chain: `package.json:29`, `scripts/dev-local.sh:11`, `scripts/dev-status.sh:10`.
- Read chain: `scripts/dev-local.sh:157`, `scripts/dev-local.sh:181`, `scripts/dev-local.sh:323`, `scripts/dev-status.sh:19`, `scripts/dev-status.sh:21`, `apps/worker-web/vite.config.ts:9`.
- Runtime proof: `bun run dev:status` printed `api: http://127.0.0.1:9217`.
- Limitation: Host Web uses `AIWORKER_HOST_API_URL`, not this variable.

### AIWORKER_WORKER_MANIFEST

- Scope: `root-dev`, `worker-dev`.
- Purpose: Worker dev lifecycle manifest path.
- Root example: `.env.example:31`.
- Package subset: no.
- Load chain: `scripts/dev-local.sh:12`, `scripts/dev-status.sh:11`, `scripts/dev-clean.sh:10`.
- Read chain: `scripts/dev-local.sh:317`, `scripts/dev-local.sh:318`, `scripts/dev-status.sh:66`, `scripts/dev-clean.sh:87`.
- Runtime proof: `bun run dev:status` checked `/Users/ben/.aiworker-dev/dev-worker.json`.
- Limitation: Host lifecycle uses `AIWORKER_HOST_MANIFEST`.

### AIWORKER_WORKER_WEB_TMUX_SESSION

- Scope: `root-dev`, `worker-dev`.
- Purpose: Worker Web tmux session name.
- Root example: `.env.example:32`.
- Package subset: no.
- Load chain: `scripts/dev-local.sh:13`, `scripts/dev-status.sh:12`, `scripts/dev-clean.sh:11`.
- Read chain: `scripts/dev-local.sh:148`, `scripts/dev-local.sh:155`, `scripts/dev-local.sh:327`, `scripts/dev-status.sh:37`, `scripts/dev-clean.sh:19`.
- Runtime proof: `bun run dev:status` checked tmux session `aiworker-vite-worker`.
- Limitation: Host Web tmux uses `AIWORKER_HOST_WEB_TMUX_SESSION`.

### AIWORKER_LOCAL_TOKEN

- Scope: `root-dev`, `worker-runtime`, `worker-daemon-package`.
- Purpose: optional local bearer token for Worker API; warning when absent and host is exposed beyond loopback.
- Root example: `.env.example:39`.
- Package subset: `packages/worker-daemon/.env.example:11`.
- Load chain: Worker daemon entries start via `package.json:28` or CLI daemon paths and parse `process.env`.
- Read chain: `packages/worker-runtime/src/config/worker.ts:18`, `packages/worker-daemon/src/modes/worker.ts:159`, `apps/worker-cli/src/aiworker.ts:1423`, `packages/worker-daemon/src/modes/worker.ts:758`.
- Runtime effect: creates local bearer auth provider and exposure warning.
- Limitation: blank `.env` placeholder is treated as unset by `blankEnvValueAsUnset` at `packages/worker-runtime/src/config/worker.ts:8`.

### WORKER_DB_PATH

- Scope: `root-dev`, `worker-runtime`, `worker-daemon-package`.
- Purpose: single-home Worker SQLite DB override.
- Root example: `.env.example:43`.
- Package subset: `packages/worker-daemon/.env.example:13`.
- Load chain: Worker daemon/CLI starts inherit `process.env`; CLI also writes derived value into child daemon env.
- Read chain: `packages/worker-runtime/src/config/worker.ts:15`, `packages/worker-daemon/src/modes/worker.ts:129`, `apps/worker-cli/src/aiworker.ts:405`, `apps/worker-cli/src/aiworker.ts:1095`.
- Runtime effect: controls Worker DB path for direct/single-home daemon.
- Limitation: fleet workers intentionally ignore ambient `WORKER_DB_PATH`; see `scripts/dev-fleet-web.ts:197`.

### WORKER_MIGRATIONS_FOLDER

- Scope: `root-dev`, `worker-runtime`, `worker-daemon-package`.
- Purpose: optional SQLite migrations folder override.
- Root example: `.env.example:47`.
- Package subset: `packages/worker-daemon/.env.example:14`.
- Load chain: Worker daemon/CLI starts inherit `process.env`; CLI sets a derived default when absent.
- Read chain: `packages/worker-runtime/src/config/worker.ts:16`, `packages/worker-daemon/src/modes/worker.ts:133`, `apps/worker-cli/src/aiworker.ts:412`, `apps/worker-cli/src/aiworker.ts:444`.
- Runtime effect: controls migration source path before Worker DB bootstrap.
- Limitation: usually blank; runtime resolves the package migrations folder.

### WORKER_WORKSPACE_ROOT

- Scope: `root-dev`, `worker-runtime`, `worker-daemon-package`.
- Purpose: optional Worker workspace root override.
- Root example: `.env.example:51`.
- Package subset: `packages/worker-daemon/.env.example:15`.
- Load chain: Worker daemon parses `process.env` through `getWorkerEnv`.
- Read chain: `packages/worker-runtime/src/config/worker.ts:17`.
- Runtime effect: affects workspace root when runtime code requests `workerEnv.WORKER_WORKSPACE_ROOT`.
- Limitation: current daemon bootstrap also derives `workersRoot` from DB path at `packages/worker-daemon/src/modes/worker.ts:136`; this variable is valid schema but has narrower current runtime reach than DB/migrations.

### AIWORKER_BUN_BIN

- Scope: `cli-shim`.
- Purpose: custom Bun executable override for packaged npm/bunx CLI shim.
- Root example: `.env.example:59`.
- Package subset: no.
- Load chain: this is not loaded by source `bun run dev:*`; it is read by the external shell environment of the packaged shim.
- Read chain: `apps/worker-cli/scripts/aiworker-bin-shim.sh:28`, user-facing fallback text at `apps/worker-cli/scripts/aiworker-bin-shim.sh:58`.
- Runtime effect: shell shim executes that Bun binary before checking PATH.
- Limitation: project root `.env` is not automatically read by this POSIX shell shim; this entry is documentation for CLI packaging/developer testing, not source dev startup.

### AIWORKER_DEV_FLEET_PURGE

- Scope: `root-dev`, `fleet-dev`.
- Purpose: opt-in destructive purge for `dev:fleet:clean`.
- Root example: `.env.example:66`.
- Package subset: no.
- Load chain: fleet scripts start through `package.json:33` and `package.json:34`; clean itself is not prechecked but Bun still starts `scripts/dev-fleet-web.ts`.
- Read chain: `scripts/dev-fleet-web.ts:270`, `scripts/dev-fleet-web.ts:656`, `scripts/dev-fleet-web.ts:666`.
- Runtime effect: when `1`, fleet clean deletes the whole `AIWORKER_HOME`.
- Limitation: only `dev:fleet:clean`; normal start/status ignore it.

### AIWORKER_HOST_API_PORT

- Scope: `root-dev`, `host-dev`.
- Purpose: Host API dev port.
- Root example: `.env.example:73`.
- Package subset: no.
- Load chain: `package.json:23` starts Host dev through Bun; `scripts/dev-host.sh:7` reads/defaults it.
- Read chain: `scripts/dev-host.sh:46`, `scripts/dev-host.sh:110`, `scripts/dev-host.sh:137`, `apps/host-cli/src/host-lifecycle.ts:126`.
- Runtime effect: Host daemon listens on this port in dev.
- Limitation: Worker daemon uses `PORT`, not this variable.

### AIWORKER_HOST_WEB_PORT

- Scope: `root-dev`, `host-dev`.
- Purpose: Host Web dev Vite port.
- Root example: `.env.example:74`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:8` or Host lifecycle env at `apps/host-cli/src/host-lifecycle.ts:132`.
- Read chain: `scripts/dev-host.sh:46`, `scripts/dev-host.sh:80`, `scripts/dev-host.sh:111`, `scripts/dev-host.sh:125`, `scripts/dev-host.sh:134`, `scripts/dev-host.sh:138`.
- Runtime effect: Host Web binds to this dev port.
- Limitation: Worker Web uses `AIWORKER_WEB_PORT`.

### AIWORKER_HOST_API_URL

- Scope: `root-dev`, `host-dev`, `host-cli`.
- Purpose: public Host API base URL and Host Web proxy target.
- Root example: `.env.example:77`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:9`; Host lifecycle propagates it in `apps/host-cli/src/host-lifecycle.ts:125`.
- Read chain: `scripts/dev-host.sh:65`, `scripts/dev-host.sh:109`, `scripts/dev-host.sh:125`, `scripts/dev-host.sh:133`, `apps/host-cli/src/aiworker-host.ts:133`, `apps/host-web/vite.config.ts:9`, `apps/host-web/src/host-api.ts:142`.
- Runtime proof: `bun run dev:host:status` reported Host API URL `http://127.0.0.1:9117`.
- Limitation: Worker Web API target is `AIWORKER_API_URL`.

### AIWORKER_HOST_DB

- Scope: `root-dev`, `host-dev`.
- Purpose: Host local SQLite DB path.
- Root example: `.env.example:80`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:10`.
- Read chain: `scripts/dev-host.sh:105`, `scripts/dev-host.sh:135`, `scripts/dev-host.sh:145`, `scripts/dev-host.sh:155`, `apps/host-cli/src/host-lifecycle.ts:127`.
- Runtime effect: Host daemon foreground receives this path via `--db`.
- Limitation: not used by Worker DB.

### AIWORKER_HOST_MANIFEST

- Scope: `root-dev`, `host-dev`, `host-cli`.
- Purpose: Host lifecycle manifest path.
- Root example: `.env.example:81`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:11` and Host CLI status/start paths.
- Read chain: `scripts/dev-host.sh:108`, `scripts/dev-host.sh:129`, `scripts/dev-host.sh:142`, `apps/host-cli/src/host-lifecycle.ts:129`, `apps/host-cli/src/host-lifecycle.ts:462`.
- Runtime proof: `bun run dev:host:status` printed `/Users/ben/.aiworker-dev/dev-host.json`.
- Limitation: Worker manifest uses `AIWORKER_WORKER_MANIFEST`.

### AIWORKER_HOST_LOG_DIR

- Scope: `root-dev`, `host-dev`.
- Purpose: Host dev log directory used to derive daemon log default.
- Root example: `.env.example:82`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:12`.
- Read chain: `scripts/dev-host.sh:13` derives `AIWORKER_HOST_DAEMON_LOG`.
- Runtime effect: changes default Host daemon log path if `AIWORKER_HOST_DAEMON_LOG` is not explicitly set.
- Limitation: direct consumer is derivation only; the daemon receives the final log path via shell redirection.

### AIWORKER_HOST_DAEMON_LOG

- Scope: `root-dev`, `host-dev`.
- Purpose: Host daemon log path.
- Root example: `.env.example:83`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:13`.
- Read chain: `scripts/dev-host.sh:100`, `scripts/dev-host.sh:112`, `scripts/dev-host.sh:115`, `scripts/dev-host.sh:137`, `scripts/dev-host.sh:168`.
- Runtime effect: stdout/stderr from Host daemon foreground are appended here.
- Limitation: Worker daemon log is managed by Worker CLI local paths, not this variable.

### AIWORKER_HOST_WEB_TMUX_SESSION

- Scope: `root-dev`, `host-dev`.
- Purpose: Host Web tmux session name.
- Root example: `.env.example:84`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:15`.
- Read chain: `scripts/dev-host.sh:55`, `scripts/dev-host.sh:120`, `scripts/dev-host.sh:123`, `scripts/dev-host.sh:138`, `scripts/dev-host.sh:169`.
- Runtime effect: controls Host Web tmux session name.
- Limitation: Worker Web tmux uses `AIWORKER_WORKER_WEB_TMUX_SESSION`.

### AIWORKER_HOST_DEV_ADMIN_EMAIL

- Scope: `root-dev`, `host-dev`, `host-cli`.
- Purpose: development-only static Host admin email when Logto/session auth is not active.
- Root example: `.env.example:87`.
- Package subset: no.
- Load chain: `scripts/dev-host.sh:14`; Host lifecycle defaults from env at `apps/host-cli/src/host-lifecycle.ts:128`.
- Read chain: `scripts/dev-host.sh:106`, `scripts/dev-host.sh:156`, `apps/host-cli/src/host-lifecycle.ts:128`.
- Runtime effect: passed to Host daemon foreground as `--dev-admin-email`.
- Limitation: ignored when Logto session auth is configured, because session auth becomes authority.

### AIWORKER_HOST_BROWSER_BASE_URL

- Scope: `root-dev`, `host-cli`.
- Purpose: browser-facing Host base URL for auth redirects.
- Root example: `.env.example:90`.
- Package subset: no.
- Load chain: Host CLI starts through `package.json:23` or `package.json:24` and reads `process.env`.
- Read chain: `apps/host-cli/src/aiworker-host.ts:131`, propagated in `apps/host-cli/src/host-lifecycle.ts:130`.
- Runtime effect: redirect URI base for Logto session auth.
- Limitation: blank values are ignored via `readNonEmptyEnvValue`.

### AIWORKER_HOST_CONTROL_BASE_URL

- Scope: `root-dev`, `host-cli`.
- Purpose: Worker control/check-in URL override for Host.
- Root example: `.env.example:91`.
- Package subset: no.
- Load chain: Host CLI reads `process.env`.
- Read chain: `apps/host-cli/src/aiworker-host.ts:132`, propagated in `apps/host-cli/src/host-lifecycle.ts:131`.
- Runtime effect: sets Host control base URL in lifecycle input.
- Limitation: this is Host-side control URL; provisioned Workers use `AIWORKER_HOST_URL`.

### AIWORKER_HOST_WEB_STATIC_DIR

- Scope: `root-dev`, `host-cli`.
- Purpose: production Host Web static asset directory override.
- Root example: `.env.example:94`.
- Package subset: no.
- Load chain: Host prod/static serve path reads `process.env`.
- Read chain: `apps/host-cli/src/host-lifecycle.ts:576`.
- Runtime effect: first candidate path for Host static assets.
- Limitation: not used by Host dev Vite; dev uses `apps/host-web`.

### AIWORKER_HOST_SESSION_SECRET

- Scope: `root-dev`, `host-cli`.
- Purpose: Host session secret for Logto-backed session auth.
- Root example: `.env.example:103`.
- Package subset: no.
- Load chain: Host CLI reads `process.env` when any Logto session env is set.
- Read chain: required key list at `apps/host-cli/src/aiworker-host.ts:49`, validation at `apps/host-cli/src/aiworker-host.ts:67`, propagation at `apps/host-cli/src/host-lifecycle.ts:520`.
- Runtime effect: enables session auth together with the rest of the required Logto keys.
- Limitation: all-or-nothing; partial Logto env fails before lifecycle start.

### AIWORKER_HOST_ALLOWED_EMAIL_DOMAINS

- Scope: `root-dev`, `host-cli`.
- Purpose: allowed email domains for Host Logto session auth.
- Root example: `.env.example:104`.
- Package subset: no.
- Load chain: same Logto session auth path as `AIWORKER_HOST_SESSION_SECRET`.
- Read chain: `apps/host-cli/src/aiworker-host.ts:51`, parsing at `apps/host-cli/src/aiworker-host.ts:68`, propagation at `apps/host-cli/src/host-lifecycle.ts:518`.
- Runtime effect: constrains authenticated Host users by email domain.
- Limitation: required only when Logto session auth is active.

### LOGTO_CLIENT_ID

- Scope: `root-dev`, `host-cli`.
- Purpose: Logto OIDC client id for Host session auth.
- Root example: `.env.example:105`.
- Package subset: no.
- Load chain: Host CLI reads `process.env` when Logto session auth is active.
- Read chain: `apps/host-cli/src/aiworker-host.ts:52`, `apps/host-cli/src/aiworker-host.ts:69`, `apps/host-cli/src/host-lifecycle.ts:521`.
- Runtime effect: passed to Host lifecycle session auth options.
- Limitation: distinct from Logto M2M app config parser values, which are not root env startup variables.

### LOGTO_CLIENT_SECRET

- Scope: `root-dev`, `host-cli`.
- Purpose: Logto OIDC client secret for Host session auth.
- Root example: `.env.example:106`.
- Package subset: no.
- Load chain: Host CLI reads `process.env` when Logto session auth is active.
- Read chain: `apps/host-cli/src/aiworker-host.ts:53`, `apps/host-cli/src/aiworker-host.ts:70`, `apps/host-cli/src/host-lifecycle.ts:522`.
- Runtime effect: passed to OIDC session config.
- Limitation: blank placeholder is ignored; partial nonblank Logto config fails.

### LOGTO_ENDPOINT

- Scope: `root-dev`, `host-cli`.
- Purpose: Logto endpoint for Host session auth.
- Root example: `.env.example:107`.
- Package subset: no.
- Load chain: Host CLI reads `process.env` when Logto session auth is active.
- Read chain: `apps/host-cli/src/aiworker-host.ts:54`, `apps/host-cli/src/aiworker-host.ts:71`, `apps/host-cli/src/host-lifecycle.ts:523`.
- Runtime effect: passed to OIDC session config.
- Limitation: the same key string also appears in Logto app config text parsing, but root env inclusion is justified by Host session auth startup.

### LOGTO_ISSUER

- Scope: `root-dev`, `host-cli`.
- Purpose: Logto issuer for Host session auth.
- Root example: `.env.example:108`.
- Package subset: no.
- Load chain: Host CLI reads `process.env` when Logto session auth is active.
- Read chain: `apps/host-cli/src/aiworker-host.ts:55`, `apps/host-cli/src/aiworker-host.ts:72`, `apps/host-cli/src/host-lifecycle.ts:524`.
- Runtime effect: passed to OIDC session config.
- Limitation: required only when Logto session auth is active.

### AIWORKER_HOST_BOOTSTRAP_ADMINS

- Scope: `root-dev`, `host-cli`.
- Purpose: optional comma-separated bootstrap admin emails for Host session auth.
- Root example: `.env.example:111`.
- Package subset: no.
- Load chain: Host CLI reads this during Logto session auth build.
- Read chain: `apps/host-cli/src/aiworker-host.ts:74`, propagation at `apps/host-cli/src/host-lifecycle.ts:519`.
- Runtime effect: seeds bootstrap admins into session auth options.
- Limitation: currently only used when session auth exists; static dev admin uses `AIWORKER_HOST_DEV_ADMIN_EMAIL`.

### AIWORKER_HOST_URL

- Scope: `root-dev`, `provisioning`, `worker-daemon-package`.
- Purpose: Host URL for provisioned Worker check-in and Worker Access tunnel.
- Root example: `.env.example:118`.
- Package subset: `packages/worker-daemon/.env.example:18`.
- Load chain: provision command can set it with `buildProvisionEnv`; direct provisioned daemon can inherit it from env.
- Read chain: `apps/worker-cli/src/aiworker.ts:230`, `apps/worker-cli/src/aiworker.ts:1463`, `packages/worker-daemon/src/modes/worker.ts:715`, `packages/worker-daemon/src/modes/worker/provision-client.ts:102`, `packages/worker-daemon/src/modes/worker/provision-client.ts:117`.
- Runtime effect: Worker check-in and Worker Access websocket target.
- Limitation: ignored unless the active Worker resolution is single and provisioning data is present.

### AIWORKER_PROVISION_TOKEN

- Scope: `root-dev`, `provisioning`, `worker-daemon-package`.
- Purpose: provisioning token paired with `AIWORKER_HOST_URL`.
- Root example: `.env.example:119`.
- Package subset: `packages/worker-daemon/.env.example:19`.
- Load chain: provision command or inherited provisioned daemon env.
- Read chain: `apps/worker-cli/src/aiworker.ts:231`, `apps/worker-cli/src/aiworker.ts:1463`, `packages/worker-daemon/src/modes/worker/provision-client.ts:103`.
- Runtime effect: authenticates Worker check-in to Host.
- Limitation: no check-in occurs unless both host and token are set.

### AIWORKER_CODEX_DISABLE_PLUGINS

- Scope: `root-dev`, `engine-invocation`, `worker-daemon-package`.
- Purpose: add `--disable plugins` to Codex native engine invocation.
- Root example: `.env.example:126`.
- Package subset: `packages/worker-daemon/.env.example:22`.
- Load chain: Worker daemon process inherits root `.env`; engine executor reads `process.env` during invocation.
- Read chain: `packages/worker-runtime/src/worker/executor.ts:118`.
- Runtime effect: when set to `1`, disables Codex plugins for the spawned engine process.
- Limitation: not read at daemon boot; only when an engine invocation is built.

### AIWORKER_CODEX_IGNORE_USER_CONFIG

- Scope: `root-dev`, `engine-invocation`, `worker-daemon-package`.
- Purpose: add `--ignore-user-config` to Codex native engine invocation.
- Root example: `.env.example:127`.
- Package subset: `packages/worker-daemon/.env.example:23`.
- Load chain: Worker daemon process inherits root `.env`; executor reads `process.env` during invocation.
- Read chain: `packages/worker-runtime/src/worker/executor.ts:120`.
- Runtime effect: when set to `1`, Codex is launched without user config.
- Limitation: not a daemon startup setting; it affects only command construction for Codex invocations.

### AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS

- Scope: `root-dev`, `engine-invocation`, `worker-daemon-package`.
- Purpose: default timeout for local CLI engine execution.
- Root example: `.env.example:130`.
- Package subset: `packages/worker-daemon/.env.example:24`.
- Load chain: Worker runtime executor reads inherited `process.env` when no explicit timeout is configured.
- Read chain: `packages/worker-runtime/src/worker/executor.ts:304`, `packages/worker-runtime/src/worker/executor.ts:308`.
- Runtime effect: controls local CLI engine timeout.
- Limitation: explicit invocation timeout takes precedence.

### OD_CODEX_DISABLE_PLUGINS

- Scope: `root-dev`, `engine-invocation`, `worker-daemon-package`.
- Purpose: legacy/compat flag that also disables Codex plugins.
- Root example: `.env.example:133`.
- Package subset: `packages/worker-daemon/.env.example:25`.
- Load chain: Worker runtime executor reads inherited `process.env`.
- Read chain: `packages/worker-runtime/src/worker/executor.ts:118`.
- Runtime effect: same effect as `AIWORKER_CODEX_DISABLE_PLUGINS=1`.
- Limitation: kept for compatibility; prefer `AIWORKER_CODEX_DISABLE_PLUGINS`.

### OPENAI_API_KEY

- Scope: `root-dev`, `byok`, `worker-daemon-package`.
- Purpose: BYOK secret target for settings references such as `env:OPENAI_API_KEY`.
- Root example: `.env.example:137`.
- Package subset: `packages/worker-daemon/.env.example:26`.
- Load chain: Worker runtime inherits env; settings store references only the env name; executor resolves it during BYOK invocation.
- Read chain: example placeholder in `packages/worker-runtime/src/worker/executor.ts:486`, actual lookup at `packages/worker-runtime/src/worker/executor.ts:490`, UI placeholder at `apps/worker-web/src/features/settings/components/settings-dialog.tsx:437`.
- Runtime effect: provides the actual secret when BYOK config references it.
- Limitation: not read unless the selected engine/settings reference this env name.

### ANTHROPIC_API_KEY

- Scope: `root-dev`, `byok`, `worker-daemon-package`.
- Purpose: BYOK secret target for Anthropic-compatible settings references.
- Root example: `.env.example:138`.
- Package subset: `packages/worker-daemon/.env.example:27`.
- Load chain: Worker runtime inherits env; executor can resolve arbitrary `env:NAME` refs through the same BYOK lookup.
- Read chain: generic lookup at `packages/worker-runtime/src/worker/executor.ts:483`, `packages/worker-runtime/src/worker/executor.ts:490`; propagation behavior is tested in `packages/worker-runtime/src/worker/engine-env.test.ts`.
- Runtime effect: provides the actual secret when BYOK config references `env:ANTHROPIC_API_KEY`.
- Limitation: not read by name in production code; included because BYOK supports arbitrary `env:NAME` references and tests cover this provider key.

## Excluded Classes

The following classes are intentionally not in root `.env.example` unless a real
project-dev startup path is added:

- External local reverse-proxy values such as `CADDY_BASIC_AUTH_*`.
- Logto M2M app setup text parser keys such as `LOGTO_M2M_APP_ID`,
  `LOGTO_M2M_APP_SECRET`, `LOGTO_TENANT_ID`,
  `LOGTO_MANAGEMENT_ENDPOINT`, and `LOGTO_MANAGEMENT_API_INDICATOR`.
- Test-only knobs such as `AIWORKER_ENGINE_REAL_*`,
  `AIWORKER_BROWSER_WORKBENCH_RENDER_TIMEOUT_MS`, and `AIWORKER_E2E_*`.
- Legacy/container-only values without current readers, including
  `AIWORKER_MODE`, `AIWORKER_MASTER_KEY`, `INTERNAL_SHARED_SECRET`,
  `CLOUD_GATEWAY_*`, `OPENAI_BASE_URL`, `OPENAI_MODEL`,
  `OPENAI_TIMEOUT_MS`, `MAX_CONCURRENT_TOTAL`, and `PROCESS_*`.

