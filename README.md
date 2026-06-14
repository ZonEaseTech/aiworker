# AIWorker

AIWorker CLI is the core of this project: a thin enterprise distribution layer for [Paseo](https://paseo.sh/docs) workspaces.

The product no longer builds an employee-side Worker daemon, Workbench, chat UI, session runtime, or native-engine bridge. Paseo already owns the daemon, clients, workspaces, sessions, provider orchestration, permissions, logs, relay/direct connections, and CLI automation. AIWorker keeps only the enterprise layer required to turn expert-authored capability into assigned Paseo workspaces.

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
  -> AIWorker CLI assigns user + target + Soul + provider profile
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
apps/aiworker-cli/          the only product CLI: describe and plan AIWorker provisioning
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

Plan a provisioning command from a built Soul descriptor:

```bash
bun run build:official-souls
bun apps/aiworker-cli/src/aiworker.ts plan-provision \
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

Execute the same provisioning explicitly through aissh:

```bash
export AISSH_TOKEN=...             # real secret lives in env or your secret manager, never in Soul files
export AISSH_SERVER=https://...    # optional, depending on your aissh control plane
bun apps/aiworker-cli/src/aiworker.ts provision \
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

`aiworker provision` resolves aissh as `--aissh-bin` / `AISSH_BIN` → bundled optional `aissh-cli` launcher → `PATH`. It runs aissh from a neutral temporary directory so local `.aissh.yaml` files cannot override env credentials.

## Non-goals

AIWorker must not reintroduce a Worker daemon, Workbench, session/invocation protocol, engine bridge, runtime event projection, local broker API, or Paseo fork/vendor/embed. Employee work happens in Paseo.
