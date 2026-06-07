# AIWorker environment inventory

This file records the environment variables audited on 2026-06-07. The evidence
standard is startup/runtime loading, not plain text presence in the repository.

## Evidence Standard

- **Startup-loaded**: a supported entrypoint is started through `bun run` or
  `bun`, Bun loads root `.env`, the value is inherited by the process or child
  script, and that startup/runtime path reads the variable.
- **Path-specific**: the value is loaded into the process, but is only read when
  a feature path runs, such as engine invocation, provisioning, or packaged CLI
  shim startup.
- **Test-only**: the value is read only by tests or E2E sampling scripts.
- **No current startup evidence**: no supported AIWorker startup/runtime path
  currently reads the value. These values must not be presented as active root
  `.env.example` variables.

Direct probe:

```text
bun direct: from-dotenv
bash direct: missing
```

This means root `.env` is loaded by Bun, and bash scripts only see those values
when launched through a Bun script runner such as `bun run dev:status`.

Additional startup probes:

- `AIWORKER_HOME=/tmp/... AIWORKER_API_URL=http://127.0.0.1:65530 bun run dev:status`
  printed the injected home and API URL.
- `AIWORKER_HOST_MANIFEST=/tmp/... bun run dev:host:status` printed the injected
  manifest path.

## Startup-Loaded Variables

| Variable | Purpose | Coverage | Evidence chain |
| --- | --- | --- | --- |
| `AIWORKER_HOME` | AIWorker local home; source dev defaults to `~/.aiworker-dev`, packaged CLI defaults to `~/.aiworker`. | Worker dev/status/clean, fleet, CLI and worker-daemon path resolution. | `scripts/dev-local.sh:6`, `scripts/dev-status.sh:6`, `packages/fs-layout/src/index.ts:52`, `apps/worker-cli/src/aiworker.ts:410`, startup probe output. |
| `AIWORKER_HOST` | Shared local bind host for source dev scripts. | Worker dev/status and Host dev scripts; fleet host validation. | `scripts/dev-local.sh:7`, `scripts/dev-host.sh:6`, `scripts/dev-fleet-web.ts:224`. |
| `AIWORKER_WORKER_HOST` | Worker daemon bind host. | Worker daemon startup and `dev:worker-daemon`; defaults to `AIWORKER_HOST` in source dev. | `scripts/dev-local.sh:8`, `package.json:26`, `packages/worker-runtime/src/config/worker.ts:14`, `apps/worker-cli/src/aiworker.ts:1419`. |
| `PORT` | Worker daemon port. | Worker daemon startup, dev status/clean, direct package daemon. | `scripts/dev-local.sh:9`, `scripts/dev-status.sh:8`, `packages/worker-runtime/src/config/worker.ts:13`, `apps/worker-cli/src/aiworker.ts:1421`. |
| `AIWORKER_WEB_HOST` | Worker Web host for the standalone `bun run dev:web` script. | `dev:web` only; `dev:worker` uses `AIWORKER_HOST` instead. | `package.json:27`. |
| `AIWORKER_WEB_PORT` | Worker Web dev server port. | Worker dev/status/clean and `dev:web`. | `scripts/dev-local.sh:10`, `scripts/dev-status.sh:9`, `package.json:27`. |
| `AIWORKER_API_URL` | Worker Web API target and dev healthcheck target. | Worker dev/status and standalone Worker Web dev. | `scripts/dev-local.sh:11`, `scripts/dev-local.sh:157`, `scripts/dev-status.sh:10`, `package.json:27`. |
| `AIWORKER_WORKER_MANIFEST` | Worker dev lifecycle manifest path. | Worker dev/status/clean. | `scripts/dev-local.sh:12`, `scripts/dev-local.sh:318`, `scripts/dev-status.sh:11`, `scripts/dev-clean.sh:10`. |
| `AIWORKER_WORKER_WEB_TMUX_SESSION` | Worker Web tmux session name. | Worker dev/status/clean. | `scripts/dev-local.sh:13`, `scripts/dev-local.sh:155`, `scripts/dev-status.sh:12`, `scripts/dev-clean.sh:11`. |
| `AIWORKER_LOCAL_TOKEN` | Optional local Worker API bearer token; required when exposing beyond loopback. | Worker daemon startup auth provider and exposure warning. | `packages/worker-runtime/src/config/worker.ts:18`, `packages/worker-daemon/src/modes/worker.ts:159`, `packages/worker-daemon/src/modes/worker.ts:761`. |
| `WORKER_DB_PATH` | Worker SQLite DB override for single-home CLI/direct daemon. | Worker daemon startup and CLI daemon child env. | `packages/worker-runtime/src/config/worker.ts:15`, `packages/worker-daemon/src/modes/worker.ts:129`, `apps/worker-cli/src/aiworker.ts:405`, `apps/worker-cli/src/aiworker.ts:1095`. |
| `WORKER_MIGRATIONS_FOLDER` | Worker migrations folder override. | Worker daemon startup migration runner and CLI local path setup. | `packages/worker-runtime/src/config/worker.ts:16`, `packages/worker-daemon/src/modes/worker.ts:133`, `apps/worker-cli/src/aiworker.ts:412`. |
| `WORKER_WORKSPACE_ROOT` | Worker workspace root override. | Worker runtime schema; consumed by Worker app bootstrap through runtime config. | `packages/worker-runtime/src/config/worker.ts:17`. |
| `AIWORKER_DEV_FLEET_PURGE` | Allows `dev:fleet:clean` to delete the whole `AIWORKER_HOME`. | Fleet clean only. | `scripts/dev-fleet-web.ts:270`. |
| `AIWORKER_HOST_API_PORT` | Host API dev port. | Host dev startup. | `scripts/dev-host.sh:7`, `apps/host-cli/src/host-lifecycle.ts:126`. |
| `AIWORKER_HOST_WEB_PORT` | Host Web dev port. | Host dev startup. | `scripts/dev-host.sh:8`, `scripts/dev-host.sh:111`, `apps/host-cli/src/host-lifecycle.ts:132`. |
| `AIWORKER_HOST_API_URL` | Public Host API base URL and Host Web proxy target. | Host CLI lifecycle and Host dev script. | `scripts/dev-host.sh:9`, `scripts/dev-host.sh:125`, `apps/host-cli/src/aiworker-host.ts:133`, `apps/host-cli/src/host-lifecycle.ts:125`. |
| `AIWORKER_HOST_DB` | Host SQLite DB path. | Host dev startup. | `scripts/dev-host.sh:10`, `scripts/dev-host.sh:105`, `apps/host-cli/src/host-lifecycle.ts:127`. |
| `AIWORKER_HOST_MANIFEST` | Host lifecycle manifest path. | Host status/start/stop/clean. | `scripts/dev-host.sh:11`, `apps/host-cli/src/host-lifecycle.ts:129`, `apps/host-cli/src/host-lifecycle.ts:463`, startup probe output. |
| `AIWORKER_HOST_LOG_DIR` | Host dev log directory used to derive daemon log default. | Host dev script. | `scripts/dev-host.sh:12`. |
| `AIWORKER_HOST_DAEMON_LOG` | Host daemon log path. | Host dev startup. | `scripts/dev-host.sh:13`, `scripts/dev-host.sh:112`. |
| `AIWORKER_HOST_WEB_TMUX_SESSION` | Host Web tmux session name. | Host dev startup. | `scripts/dev-host.sh:15`, `scripts/dev-host.sh:123`. |
| `AIWORKER_HOST_DEV_ADMIN_EMAIL` | Dev-only static Host admin email when Logto/session auth is not active. | Host dev startup. | `scripts/dev-host.sh:14`, `scripts/dev-host.sh:106`, `apps/host-cli/src/host-lifecycle.ts:128`. |
| `AIWORKER_HOST_BROWSER_BASE_URL` | Public browser URL override for Host auth redirects. | Host CLI startup/options. | `apps/host-cli/src/aiworker-host.ts:131`, `apps/host-cli/src/host-lifecycle.ts:130`. |
| `AIWORKER_HOST_CONTROL_BASE_URL` | Worker control/check-in URL override. | Host CLI startup/options. | `apps/host-cli/src/aiworker-host.ts:132`, `apps/host-cli/src/host-lifecycle.ts:131`. |
| `AIWORKER_HOST_WEB_STATIC_DIR` | Production Host Web static asset directory override. | Host prod serve path. | `apps/host-cli/src/host-lifecycle.ts:576`. |
| `AIWORKER_HOST_SESSION_SECRET` | Host session encryption/signing secret for Logto session auth. | Host CLI startup when any required Logto session env is set. | `apps/host-cli/src/aiworker-host.ts:49`, `apps/host-cli/src/aiworker-host.ts:67`, `apps/host-cli/src/host-lifecycle.ts:520`. |
| `AIWORKER_HOST_ALLOWED_EMAIL_DOMAINS` | Host Logto allowed email domains. | Host CLI startup when Logto session auth is active. | `apps/host-cli/src/aiworker-host.ts:51`, `apps/host-cli/src/aiworker-host.ts:68`, `apps/host-cli/src/host-lifecycle.ts:518`. |
| `LOGTO_CLIENT_ID` | Host Logto OIDC client id. | Host CLI startup when Logto session auth is active. | `apps/host-cli/src/aiworker-host.ts:52`, `apps/host-cli/src/aiworker-host.ts:69`, `apps/host-cli/src/host-lifecycle.ts:521`. |
| `LOGTO_CLIENT_SECRET` | Host Logto OIDC client secret. | Host CLI startup when Logto session auth is active. | `apps/host-cli/src/aiworker-host.ts:53`, `apps/host-cli/src/aiworker-host.ts:70`, `apps/host-cli/src/host-lifecycle.ts:522`. |
| `LOGTO_ENDPOINT` | Host Logto endpoint. | Host CLI startup when Logto session auth is active; also appears in Logto app config text parser. | `apps/host-cli/src/aiworker-host.ts:54`, `apps/host-cli/src/aiworker-host.ts:71`, `apps/host-cli/src/logto-app-config.ts:88`. |
| `LOGTO_ISSUER` | Host Logto issuer. | Host CLI startup when Logto session auth is active; also appears in Logto app config text parser. | `apps/host-cli/src/aiworker-host.ts:55`, `apps/host-cli/src/aiworker-host.ts:72`, `apps/host-cli/src/logto-app-config.ts:89`. |
| `AIWORKER_HOST_BOOTSTRAP_ADMINS` | Optional comma-separated Host admin emails. | Host CLI startup only when Logto session auth is active. | `apps/host-cli/src/aiworker-host.ts:74`, `apps/host-cli/src/host-lifecycle.ts:519`. |

## Path-Specific Runtime Variables

| Variable | Purpose | Coverage | Evidence chain |
| --- | --- | --- | --- |
| `AIWORKER_BUN_BIN` | Custom Bun executable for the packaged npm/bunx CLI shim. | Packaged shell shim startup only; not source `bun run dev:*`. | `apps/worker-cli/scripts/aiworker-bin-shim.sh:28`, `apps/worker-cli/scripts/aiworker-bin-shim.sh:58`. |
| `AIWORKER_HOST_URL` | Host URL used by provisioned Workers for check-in and Worker Access tunnel. | Worker daemon startup path only when provisioned Worker env is present. | `apps/worker-cli/src/aiworker.ts:230`, `packages/worker-daemon/src/modes/worker.ts:715`, `packages/worker-daemon/src/modes/worker/provision-client.ts:102`, `packages/worker-daemon/src/modes/worker/provision-client.ts:117`. |
| `AIWORKER_PROVISION_TOKEN` | Provisioning token used with `AIWORKER_HOST_URL`. | Worker daemon startup path only when provisioned Worker env is present. | `apps/worker-cli/src/aiworker.ts:231`, `apps/worker-cli/src/aiworker.ts:1463`, `packages/worker-daemon/src/modes/worker/provision-client.ts:103`. |
| `AIWORKER_CODEX_DISABLE_PLUGINS` | Adds `--disable plugins` to Codex CLI invocation. | Engine invocation path, not daemon boot itself. | `packages/worker-runtime/src/worker/executor.ts:118`. |
| `AIWORKER_CODEX_IGNORE_USER_CONFIG` | Adds `--ignore-user-config` to Codex CLI invocation. | Engine invocation path, not daemon boot itself. | `packages/worker-runtime/src/worker/executor.ts:120`. |
| `AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS` | Default local CLI engine timeout. | Engine invocation path and E2E sampling generated env. | `packages/worker-runtime/src/worker/executor.ts:308`, `scripts/e2e-soul-sampling.ts:900`. |
| `OD_CODEX_DISABLE_PLUGINS` | Legacy/compat Codex plugin disable flag. | Engine invocation path. | `packages/worker-runtime/src/worker/executor.ts:118`. |
| `OPENAI_API_KEY` | BYOK API key reference target, for settings such as `env:OPENAI_API_KEY`. | Engine invocation path only when BYOK settings reference it. | `packages/worker-runtime/src/worker/executor.ts:483`, `apps/worker-web/src/features/settings/components/settings-dialog.tsx:437`. |
| `ANTHROPIC_API_KEY` | BYOK API key reference target, for settings such as `env:ANTHROPIC_API_KEY`. | Engine invocation path only when BYOK settings reference it. | `packages/worker-runtime/src/worker/executor.ts:483`, `packages/worker-runtime/src/worker/engine-env.test.ts:13`. |

## Tool/Text-Config Variables

These keys are parsed from a supplied Logto app config text/file. They are not
read from `process.env` by normal Host startup.

| Variable | Purpose | Coverage | Evidence chain |
| --- | --- | --- | --- |
| `LOGTO_M2M_APP_ID` | Logto Management API M2M app id in config text. | Logto app config parser only. | `apps/host-cli/src/logto-app-config.ts:90`. |
| `LOGTO_M2M_APP_SECRET` | Logto Management API M2M app secret in config text. | Logto app config parser only. | `apps/host-cli/src/logto-app-config.ts:91`. |
| `LOGTO_TENANT_ID` | Optional Logto tenant id in config text. | Logto app config parser only. | `apps/host-cli/src/logto-app-config.ts:86`. |
| `LOGTO_MANAGEMENT_ENDPOINT` | Optional explicit Logto Management endpoint in config text. | Logto app config parser only. | `apps/host-cli/src/logto-app-config.ts:98`. |
| `LOGTO_MANAGEMENT_API_INDICATOR` | Optional explicit Logto Management API indicator in config text. | Logto app config parser only. | `apps/host-cli/src/logto-app-config.ts:99`. |

## Test-Only Variables

| Variable | Purpose | Coverage | Evidence chain |
| --- | --- | --- | --- |
| `AIWORKER_BROWSER_WORKBENCH_RENDER_TIMEOUT_MS` | Browser test wait timeout. | Test-only. | `tests/browser/workbench-render-wait.ts:4`. |
| `AIWORKER_ENGINE_REAL_TIMEOUT_MS` | Real-engine acceptance test timeout. | Test-only. | `tests/engine-real/engine-management.acceptance.ts:80`. |
| `AIWORKER_ENGINE_REAL_SHORT_TIMEOUT_MS` | Real-engine short timeout. | Test-only. | `tests/engine-real/engine-management.acceptance.ts:81`. |
| `AIWORKER_ENGINE_REAL_WAIT_TIMEOUT_MS` | Real-engine wait timeout. | Test-only. | `tests/engine-real/engine-management.acceptance.ts:82`. |
| `AIWORKER_ENGINE_REAL_DRAIN_MS` | Real-engine output drain wait. | Test-only. | `tests/engine-real/engine-management.acceptance.ts:83`. |
| `AIWORKER_ENGINE_REAL_SAMPLES` | Real-engine sample count. | Test-only. | `tests/engine-real/engine-management.acceptance.ts:84`, `docs/testing.md:129`. |
| `AIWORKER_E2E_RUN_ID` | Soul E2E sampling run id. | E2E script only. | `scripts/e2e-soul-sampling.ts:932`. |
| `AIWORKER_E2E_COMMIT` | Soul E2E sampling commit label. | E2E script only. | `scripts/e2e-soul-sampling.ts:934`. |
| `AIWORKER_E2E_HOME` | Soul E2E sampling home directory. | E2E script only. | `scripts/e2e-soul-sampling.ts:935`. |
| `AIWORKER_E2E_REASONING` | Soul E2E sampling reasoning effort. | E2E script only. | `scripts/e2e-soul-sampling.ts:639`. |
| `AIWORKER_E2E_ENGINE_TIMEOUT_MS` | Soul E2E sampling engine timeout, mapped into `AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS`. | E2E script only. | `scripts/e2e-soul-sampling.ts:900`. |

## No Current AIWorker Startup Evidence

These appeared in earlier generated examples or local root values, but they do
not have current AIWorker startup/runtime readers. They are intentionally absent
from root `.env.example`.

| Variable | Purpose if any | Coverage | Evidence chain |
| --- | --- | --- | --- |
| `CADDY_BASIC_AUTH_USERNAME` | Local Caddy reverse-proxy username outside AIWorker. | External local value; not AIWorker startup. | `rg CADDY_BASIC_AUTH` only finds generated docs/plans, not `apps/`, `packages/`, or `scripts/` startup code. |
| `CADDY_BASIC_AUTH_PASSWORD` | Local Caddy reverse-proxy password outside AIWorker. | External local value; not AIWorker startup. | Same as `CADDY_BASIC_AUTH_USERNAME`. |
| `AIWORKER_MODE` | Legacy/container mode hint from older package example. | No current AIWorker startup reader. | `rg AIWORKER_MODE apps packages scripts` has no reader. |
| `AIWORKER_MASTER_KEY` | Legacy/container secret from older package example. | No current startup reader; only redaction text remains. | `scripts/governance-kernel-harness.ts:221` redacts text, but does not load config. |
| `INTERNAL_SHARED_SECRET` | Legacy/container shared secret from older package example. | No current AIWorker startup reader. | `rg INTERNAL_SHARED_SECRET apps packages scripts` has no reader. |
| `CLOUD_GATEWAY_MCP_URL` | Legacy/cloud gateway hint. | No current AIWorker startup reader. | `rg CLOUD_GATEWAY_ apps packages scripts` has no reader. |
| `CLOUD_GATEWAY_MCP_TOKEN` | Legacy/cloud gateway hint. | No current AIWorker startup reader. | Same as `CLOUD_GATEWAY_MCP_URL`. |
| `CLOUD_GATEWAY_DEFAULT_CATEGORY` | Legacy/cloud gateway hint. | No current AIWorker startup reader. | Same as `CLOUD_GATEWAY_MCP_URL`. |
| `CLOUD_GATEWAY_DEFAULT_TYPE_ID` | Legacy/cloud gateway hint. | No current AIWorker startup reader. | Same as `CLOUD_GATEWAY_MCP_URL`. |
| `OPENAI_BASE_URL` | Older OpenAI provider default. | No current AIWorker startup reader. | `rg OPENAI_BASE_URL apps packages scripts` has no reader. |
| `OPENAI_MODEL` | Older OpenAI model default. | No current AIWorker startup reader. | `rg OPENAI_MODEL apps packages scripts` has no reader. |
| `OPENAI_TIMEOUT_MS` | Older OpenAI timeout default. | No current AIWorker startup reader. | `rg OPENAI_TIMEOUT_MS apps packages scripts` has no reader. |
| `MAX_CONCURRENT_TOTAL` | Older process concurrency default. | No current AIWorker startup reader. | `rg MAX_CONCURRENT_TOTAL apps packages scripts` has no reader. |
| `PROCESS_STALL_TIMEOUT_MS` | Older process manager timeout default. | No current AIWorker startup reader. | `rg PROCESS_STALL_TIMEOUT_MS apps packages scripts` has no reader. |
| `PROCESS_KILL_TIMEOUT_MS` | Older process manager timeout default. | No current AIWorker startup reader. | `rg PROCESS_KILL_TIMEOUT_MS apps packages scripts` has no reader. |
| `PROCESS_AUTO_CLEANUP_DELAY_MS` | Older process cleanup delay default. | No current AIWorker startup reader. | `rg PROCESS_AUTO_CLEANUP_DELAY_MS apps packages scripts` has no reader. |
| `PROCESS_GC_INTERVAL_MS` | Older process GC interval default. | No current AIWorker startup reader. | `rg PROCESS_GC_INTERVAL_MS apps packages scripts` has no reader. |

