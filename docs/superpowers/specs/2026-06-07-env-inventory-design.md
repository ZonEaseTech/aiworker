# Env Inventory Design

## Judgment

AIWorker needs one root-level environment contract. Environment variables are now
spread across shell scripts, Vite configs, Worker runtime schemas, Host lifecycle
code, tests, and `packages/worker-daemon/.env.example`. The fix is not to invent a
new configuration system; it is to extract the current contract, document it in
`/.env.example`, and mirror the same keys in the ignored local `/.env`.

The accepted local policy is option C: `/.env` lists the full inventory too.
Existing local values are preserved. Missing values are either non-sensitive
defaults or empty placeholders. Secrets, tokens, API keys, and passwords are
never fabricated.

## User And Scenario

The primary user is a developer or agent working inside the AIWorker monorepo.
They need to understand which variables affect local Worker, Fleet, Host, auth,
provisioning, and test flows without hunting through scripts and packages. The
successful outcome is: a new checkout can inspect `/.env.example`, copy or compare
against `/.env`, and know which values are optional, required as a group, or only
used by a specialized test path.

## Scope

Inventory sources:

- `process.env` and `Bun.env` usage in `apps`, `packages`, `scripts`, and `tests`.
- Shell-script default assignments in `scripts/*.sh`.
- Vite proxy variables in Worker Web and Host Web configs.
- Existing `packages/worker-daemon/.env.example`.
- Existing ignored root `/.env` keys.
- Canonical docs where they name runtime/provisioning env contract.

Out of scope:

- Ambient OS/runtime variables such as `PATH`, `HOME`, `USER`, `SHELL`, `TMPDIR`,
  proxy variables, `BUN_INSTALL`, `PREFIX`, and `npm_config_prefix`.
- Test fixture-only variables used only to prove sanitization behavior, such as
  `TEST_ENGINE_ENV_LOG`.
- Values embedded in old plans under `docs/superpowers/plans`; plans may help
  explain intent but do not define current env contract.
- Secret discovery outside this repo. The implementation must not inspect
  shell history, password stores, cloud consoles, or native engine config files.

## Root Files

Create `/.env.example` as the tracked source of truth for project env names. It
groups variables by operational surface:

1. Existing local/root values.
2. Worker dev profile.
3. Worker runtime and storage.
4. Worker Web.
5. Fleet dev harness.
6. Host dev/prod lifecycle.
7. Host Logto/session auth.
8. Worker provisioning/check-in.
9. Engine behavior and BYOK references.
10. Optional legacy/container worker-daemon variables from the existing package
    example.
11. Browser and real-engine test knobs.
12. Soul E2E sampling knobs.

Update ignored `/.env` with the same keys and grouping. Because `/.env` is
ignored, it can include full local placeholders without risking normal git
commit leakage. Existing real local keys are preserved:

- `CADDY_BASIC_AUTH_USERNAME`
- `CADDY_BASIC_AUTH_PASSWORD`

If a current value exists in `/.env`, keep it. If a current value does not exist,
write the documented default only when the code already has that same safe
default. Otherwise write an empty value.

Keep `packages/worker-daemon/.env.example` in place for package-local history.
If it conflicts with the new root example, update it only enough to point to the
root file or keep the subset consistent. Do not delete it in this task.

## Variable Groups

Worker dev/profile variables:

- `AIWORKER_HOME`
- `AIWORKER_HOST`
- `AIWORKER_WORKER_HOST`
- `PORT`
- `AIWORKER_WEB_HOST`
- `AIWORKER_WEB_PORT`
- `AIWORKER_API_URL`
- `AIWORKER_WORKER_MANIFEST`
- `AIWORKER_WORKER_WEB_TMUX_SESSION`

Worker runtime/storage variables:

- `AIWORKER_LOCAL_TOKEN`
- `WORKER_DB_PATH`
- `WORKER_MIGRATIONS_FOLDER`
- `WORKER_WORKSPACE_ROOT`

Worker Web:

- `AIWORKER_API_URL`

Fleet dev harness:

- `AIWORKER_DEV_FLEET_PURGE`

Host lifecycle and Web:

- `AIWORKER_HOST`
- `AIWORKER_HOST_API_PORT`
- `AIWORKER_HOST_WEB_PORT`
- `AIWORKER_HOST_API_URL`
- `AIWORKER_HOST_DB`
- `AIWORKER_HOST_MANIFEST`
- `AIWORKER_HOST_LOG_DIR`
- `AIWORKER_HOST_DAEMON_LOG`
- `AIWORKER_HOST_DEV_ADMIN_EMAIL`
- `AIWORKER_HOST_WEB_TMUX_SESSION`
- `AIWORKER_HOST_BROWSER_BASE_URL`
- `AIWORKER_HOST_CONTROL_BASE_URL`
- `AIWORKER_HOST_WEB_STATIC_DIR`

Host Logto/session auth:

- `AIWORKER_HOST_SESSION_SECRET`
- `AIWORKER_HOST_ALLOWED_EMAIL_DOMAINS`
- `AIWORKER_HOST_BOOTSTRAP_ADMINS`
- `LOGTO_CLIENT_ID`
- `LOGTO_CLIENT_SECRET`
- `LOGTO_ENDPOINT`
- `LOGTO_ISSUER`
- `LOGTO_M2M_APP_ID`
- `LOGTO_M2M_APP_SECRET`
- `LOGTO_TENANT_ID`
- `LOGTO_MANAGEMENT_ENDPOINT`
- `LOGTO_MANAGEMENT_API_INDICATOR`

Provisioning/check-in:

- `AIWORKER_HOST_URL`
- `AIWORKER_PROVISION_TOKEN`

Engine behavior and BYOK references:

- `AIWORKER_CODEX_DISABLE_PLUGINS`
- `AIWORKER_CODEX_IGNORE_USER_CONFIG`
- `AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS`
- `OD_CODEX_DISABLE_PLUGINS`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Optional worker-daemon/container variables preserved from the existing example:

- `AIWORKER_MODE`
- `AIWORKER_MASTER_KEY`
- `INTERNAL_SHARED_SECRET`
- `CLOUD_GATEWAY_MCP_URL`
- `CLOUD_GATEWAY_MCP_TOKEN`
- `CLOUD_GATEWAY_DEFAULT_CATEGORY`
- `CLOUD_GATEWAY_DEFAULT_TYPE_ID`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TIMEOUT_MS`
- `MAX_CONCURRENT_TOTAL`
- `PROCESS_STALL_TIMEOUT_MS`
- `PROCESS_KILL_TIMEOUT_MS`
- `PROCESS_AUTO_CLEANUP_DELAY_MS`
- `PROCESS_GC_INTERVAL_MS`
- `MAX_CONCURRENT_<ENGINE>`

Test and evidence knobs:

- `AIWORKER_BROWSER_WORKBENCH_RENDER_TIMEOUT_MS`
- `AIWORKER_ENGINE_REAL_TIMEOUT_MS`
- `AIWORKER_ENGINE_REAL_SHORT_TIMEOUT_MS`
- `AIWORKER_ENGINE_REAL_WAIT_TIMEOUT_MS`
- `AIWORKER_ENGINE_REAL_DRAIN_MS`
- `AIWORKER_ENGINE_REAL_SAMPLES`
- `AIWORKER_E2E_RUN_ID`
- `AIWORKER_E2E_COMMIT`
- `AIWORKER_E2E_HOME`
- `AIWORKER_E2E_REASONING`
- `AIWORKER_E2E_ENGINE_TIMEOUT_MS`

Existing local root/Caddy values:

- `CADDY_BASIC_AUTH_USERNAME`
- `CADDY_BASIC_AUTH_PASSWORD`

## Data Flow

Bun processes see root `/.env`. Shell scripts themselves do not source `/.env`,
but package scripts launched by Bun inherit Bun's environment. The examples
should therefore document values as process environment inputs, not as a custom
loader contract.

Worker Web and Host Web each consume their API URL through Vite startup env:

- Worker Web uses `AIWORKER_API_URL`.
- Host Web uses `AIWORKER_HOST_API_URL`.

Native engine child processes intentionally do not receive AIWorker internal env
keys. `AIWORKER_*`, `WORKER_*`, and `OD_*` are stripped from engine env, while
BYOK provider secrets such as `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` remain
available to the daemon for explicit `env:NAME` references.

## Error Handling

The examples must mark grouped requirements clearly:

- Logto session auth is all-or-nothing. If any required Logto/session key is set,
  all required keys must be non-empty.
- Provisioning requires both `AIWORKER_HOST_URL` and `AIWORKER_PROVISION_TOKEN`.
- Port defaults must match the dev profile contract and must not imply automatic
  Vite port drift.
- Secret placeholders stay empty. Generation commands may be documented in
  comments, but generated secrets must not be inserted by the implementation.

## Implementation Notes

The implementation should prefer a mechanical inventory:

1. Extract current env names from code, scripts, tests, docs, and existing env
   examples.
2. Classify each key as runtime, dev, auth, provisioning, optional integration,
   or test-only.
3. Write root `/.env.example` with comments and safe defaults.
4. Rewrite ignored root `/.env` using the same structure while preserving current
   values.
5. Keep package-local `packages/worker-daemon/.env.example` consistent with the
   root contract or point readers to the root file.

No runtime code change is required unless verification proves an existing env
example is actively misleading.

## Verification

Minimum verification after implementation:

- `git diff -- .env.example packages/worker-daemon/.env.example`
- `git status --short --ignored .env .env.example packages/worker-daemon/.env.example`
- A focused extraction check proving every project-specific env key found in
  source is represented in `/.env.example`, excluding documented ambient/test
  fixture-only keys.
- `bun run dev:status`
- `bun run dev:host:status`

Because this task changes config/documentation files only, no browser proof is
required. If implementation touches runtime code, run the smallest package-level
test covering that code and then run code-review-graph.

## Acceptance Criteria

- Root `/.env.example` exists and is tracked.
- Ignored root `/.env` contains the same project-specific key inventory.
- Existing local `.env` values are preserved.
- Secrets, tokens, passwords, and API keys are empty unless already present
  locally.
- Worker, Host, Fleet, provisioning, Logto, engine, and E2E/test env groups are
  visibly separated.
- Ambient OS variables are not presented as AIWorker configuration.
- The existing package-local worker-daemon example is not left contradictory.
