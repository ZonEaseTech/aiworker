# AIWorker

AIWorker CLI and AIWorker Web are thin enterprise distribution surfaces for [Paseo](https://paseo.sh/docs) workspaces.

The product no longer builds an employee-side Worker daemon, Workbench, chat UI, session runtime, or native-engine bridge. Paseo already owns the daemon, clients, workspaces, sessions, provider orchestration, permissions, logs, relay/direct connections, and CLI automation. AIWorker keeps only the enterprise layer required to turn expert-authored capability into assigned Paseo workspaces. AIWorker Web is an admin/control console for AIWorker-owned assignment, provisioning, receipt, audit, and handoff metadata; it is not a Paseo workspace UI.

## What AIWorker owns

- AIWorker-side identity and workspace assignment records.
- Target machine metadata for `aissh` provisioning.
- Paseo environment metadata such as `PASEO_HOME`, daemon endpoint, and isolation kind.
- Provider profile metadata and secret references; never literal provider keys.
- Versioned Soul releases.
- Projection of Soul files into a Paseo workspace directory.
- Redacted provisioning receipts, status, audit, and handoff metadata.

## What Paseo owns

- The employee work surface: mobile, desktop, web, and CLI clients.
- The daemon and local/relay/direct connection model.
- Workspace opening, agent sessions, follow-up messages, logs, permissions, and agent lifecycle.
- Provider orchestration for Claude Code, Codex, OpenCode, ACP providers, and other installed CLIs.
- Provider-native authentication and model configuration.

## Product flow

```text
Admin/manager
  -> AIWorker CLI/Web assigns user + target + Soul + provider profile
  -> AIWorker uses aissh to verify/install Paseo and provider CLIs
  -> AIWorker projects Soul files into a workspace directory
  -> Employee opens Paseo and works in that workspace
```

A Soul is a versioned Paseo workspace template:

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
  --target aissh:server-1 \
  --environment env_alice_server1 \
  --paseo-home /home/alice/.paseo \
  --paseo-endpoint 127.0.0.1:6767 \
  --provider codex-default \
  --provider-kind codex \
  --soul souls/aiworker-freeform/dist/soul.descriptor.json \
  --workspace /home/alice/workspaces/freeform
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
  --target aissh:server-1 \
  --environment env_alice_server1 \
  --paseo-home /home/alice/.paseo \
  --paseo-endpoint 127.0.0.1:6767 \
  --provider codex-default \
  --provider-kind codex \
  --soul souls/aiworker-freeform/dist/soul.descriptor.json \
  --workspace /home/alice/workspaces/freeform
```

`aiworker apply` resolves aissh as `--aissh-bin` / `AISSH_BIN` → bundled optional
`aissh-cli` launcher → `PATH`. It runs aissh from a neutral temporary directory so
local `.aissh.yaml` files cannot override env credentials. Non-interactive runs require
`--yes` / `--auto-approve` because they write the target workspace and may start a
Paseo daemon. Failure output omits the generated remote script; inspect that script
locally with `aiworker plan ... --show-script`.

## Non-goals

AIWorker must not reintroduce a Worker daemon, Workbench, session/invocation protocol, engine bridge, runtime event projection, local broker API, or Paseo fork/vendor/embed. Employee work happens in Paseo.
