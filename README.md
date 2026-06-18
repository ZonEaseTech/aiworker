# AIWorker

AIWorker CLI and AIWorker Web are thin enterprise distribution surfaces for [Paseo](https://paseo.sh/docs) Project workdirs.

The product no longer builds an employee-side Worker daemon, Workbench, chat UI, session runtime, or native-engine bridge. Paseo already owns the daemon, clients, projects/workspaces, optional worktrees, sessions, provider orchestration, permissions, logs, relay/direct connections, and CLI automation. AIWorker keeps only the enterprise layer required to turn expert-authored capability into assigned Paseo Project workdirs. AIWorker Web is an admin/control console for AIWorker-owned assignment, provisioning, receipt, audit, and handoff metadata; it is not a Paseo workspace UI.

## What AIWorker owns

- AIWorker-side identity and Project workdir assignment records.
- Target machine metadata for `aissh` provisioning.
- Paseo environment metadata such as `PASEO_HOME`, daemon endpoint, and isolation kind.
- Provider profile metadata and secret references; never literal provider keys.
- Versioned Soul releases.
- Projection of Soul files into a Paseo Project workdir.
- Redacted provisioning receipts, status, audit, and handoff metadata.

## What Paseo owns

- The employee work surface: mobile, desktop, web, and CLI clients.
- The daemon and local/relay/direct connection model.
- Project/workspace opening, optional worktrees, agent sessions, follow-up messages, logs, permissions, and agent lifecycle.
- Provider orchestration for Claude Code, Codex, OpenCode, ACP providers, and other installed CLIs.
- Provider-native authentication and model configuration.

## Product flow

```text
Admin/manager
  -> AIWorker CLI/Web assigns user + target + Soul + provider profile
  -> AIWorker uses aissh to verify/install Paseo and provider CLIs
  -> AIWorker projects Soul files into a Project workdir
  -> Employee opens Paseo with that directory and works in the Paseo-owned project/workspace
```

A Soul is a versioned Paseo Project workdir template:

```text
souls/my-soul/
  soul.config.ts
  engine/workspace/AGENTS.md
  engine/workspace/CLAUDE.md
  engine/workspace/business-context/**
  engine/skills/**/SKILL.md
  engine/mcp/codex/config.toml
  engine/mcp/claude-code/.mcp.json
```

Build output:

```text
dist/soul.descriptor.json
dist/workspace-template/**
```

## Current packages

```text
apps/aiworker-cli/          product CLI: plan/apply/doctor for AIWorker provisioning
apps/aiworker-web/          admin/control console for AIWorker-owned metadata
packages/aiworker-control/  assignment, aissh provisioning plan, handoff, projection guardrails
packages/soul-descriptor/   descriptor schema for workspace templates
packages/soul-sdk/          Soul authoring/build helpers
souls/*                     official workspace templates
```

## Development

```bash
bun install
bun run docs:check
bun run test:contracts
bun run test
bun run typecheck
bun run lint
bun run build
```

Run the private AIWorker Web admin console against a local control-plane
snapshot:

```bash
export AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane
export AIWORKER_WEB_ADMIN_TOKEN=<admin-token>
bun run setup:logto                  # optional but required before remote/browser SSO access
bun apps/aiworker-cli/src/aiworker.ts web
```

`bun run setup:logto` uses Logto M2M credentials from the current checkout or
`../aiworker-next`, creates/updates an `AIWorker Web Admin` Traditional app, and
writes the runtime `LOGTO_CLIENT_*` values into ignored `.env`. The Web app
accepts Logto sessions for browser administration and keeps
`AIWORKER_WEB_ADMIN_TOKEN` for automation/local bootstrap API calls.

For a local token-only run:

```bash
AIWORKER_CONTROL_PLANE_DIR=/path/to/control-plane \
AIWORKER_WEB_ADMIN_TOKEN=<admin-token> \
bun apps/aiworker-cli/src/aiworker.ts web
```

The published `aiworker web` starts the bundled private Web admin console on
loopback `http://127.0.0.1:20831` and opens the browser by default. From a
source checkout, the same CLI surface falls back to the Vite dev server. Pass
`--browser none` for terminal-only runs, `--port <port>` to change the port, or
use `bun run dev:aiworker-web` only when working directly on the Web package.

Without `AIWORKER_CONTROL_PLANE_DIR`, Web runs in fixture preview mode: approval
buttons update only the current page, and apply/pair actions do not call `aissh`
or Paseo. `AIWORKER_WEB_ADMIN_TOKEN` is a local mutation token for the private
admin app, not enterprise auth. Complete Logto configuration makes browser
navigation require login. Partial Logto configuration fails closed. Non-loopback
Web binding requires `AIWORKER_WEB_ALLOW_REMOTE=1` and Logto or an equivalent
authenticated admin boundary in front of it.

Check local CLI prerequisites without contacting a target:

```bash
bun apps/aiworker-cli/src/aiworker.ts doctor \
  --soul souls/aiworker-freeform/dist/soul.descriptor.json
```

Preview a provisioning plan from a built Soul descriptor:

```bash
bun run build:official-souls
bun apps/aiworker-cli/src/aiworker.ts plan \
  --user alice@example.com \
  --dedicated-target-user \
  --target aissh:server-1 \
  --environment env_alice_server1 \
  --paseo-listen 127.0.0.1:6767 \
  --paseo-host 127.0.0.1:6767 \
  --provider codex-default \
  --provider-kind codex \
  --soul souls/aiworker-freeform/dist/soul.descriptor.json
```

Use `--json` when another program needs the full structured plan, and `--show-script`
only when you need to inspect the generated remote shell script.

Execute the same provisioning explicitly through aissh. In an interactive terminal,
`apply` shows the same human summary and asks you to type `yes`; automation should
pass `--yes` or `--auto-approve`.

```bash
export AISSH_TOKEN=...             # real secret lives in env or your secret manager, never in Soul files
export AISSH_SERVER=https://...    # optional, depending on your aissh control plane
bun apps/aiworker-cli/src/aiworker.ts apply --yes \
  --user alice@example.com \
  --dedicated-target-user \
  --target aissh:server-1 \
  --environment env_alice_server1 \
  --paseo-listen 127.0.0.1:6767 \
  --paseo-host 127.0.0.1:6767 \
  --provider codex-default \
  --provider-kind codex \
  --soul souls/aiworker-freeform/dist/soul.descriptor.json
```

`aiworker apply` resolves aissh as `--aissh-bin` / `AISSH_BIN` → bundled optional
`aissh-cli` launcher → `PATH`. It runs aissh from a neutral temporary directory so
local `.aissh.yaml` files cannot override env credentials. If `AISSH_TOKEN` is not
set, the CLI may load the source checkout `.aissh.yaml` token and pass it through
as `AISSH_TOKEN` without printing or persisting the value. Non-interactive runs
require `--yes` / `--auto-approve` because they write the target Project workdir and may
start a Paseo daemon. Failure output omits the generated remote script; inspect
that script locally with `aiworker plan ... --show-script`.

The live Web approval-to-device acceptance run is not a fixture test. It requires
real `aissh`, a real target user HOME, a real Paseo CLI/daemon, a real built Soul
descriptor, and authority to generate a transient Paseo pairing response. A pass
means approval → apply receipt/handoff → transient pair response works without
persisting pairing URLs/QRs, raw provider output, generated scripts, or transcripts.
It must run only against a dedicated or disposable target and requires
`AIWORKER_WEB_LIVE_E2E_DEDICATED_TARGET=1` plus a matching control-plane
`PaseoEnvironment.dedication` record for the assigned user.

## Non-goals

AIWorker must not reintroduce a Worker daemon, Workbench, session/invocation protocol, engine bridge, runtime event projection, local broker API, or Paseo fork/vendor/embed. Employee work happens in Paseo.
