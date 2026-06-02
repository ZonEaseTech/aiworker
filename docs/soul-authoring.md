# AIWorker Soul Authoring

This document defines the canonical Soul authoring contract.

## Default Path

Soul authoring is SDK-centered and CLI-first. The 30-second path should be:

```text
aiworker soul create my-soul
cd souls/my-soul
aiworker soul build
aiworker app install dist/soul.descriptor.json
```

The SDK uses directory conventions for the common path and a small
`soul.config.ts` for identity and explicit overrides.

## Source Layout

Souls live under `souls/*`.

Minimum useful layout:

```text
souls/my-soul/
  package.json
  soul.config.ts
  engine/
    workspace/
    skills/
    mcp/
      codex/
        config.toml
      claude-code/
        .mcp.json
```

A Soul is a template of engine assets only. It has no capabilities, no workbench
source, and no `web/` or `api/` surfaces: the Worker owns and renders the
Workbench, and the Soul provides no UI and no app-owned API.

## Convention Discovery

Convention discovery uses the common authoring path from:

```text
engine/workspace/*
engine/skills/*
engine/mcp/codex/config.toml
engine/mcp/claude-code/.mcp.json
```

Custom API and artifact helpers are explicit SDK or configuration surfaces; they
are not current convention-discovery inputs. Custom app-owned API entries must be
explicit descriptor/build inputs when supported; they are not part of current
convention discovery or build output.

Discovery output must tell the author what the SDK found and which descriptor
sections it generated. `soul.config.ts` owns identity, display name, explicit
include/exclude choices, advanced build overrides, and SDK module opt-ins. It
must not become a Host integration file, a handwritten descriptor, or arbitrary
Host-readable configuration.

Build output is installed through descriptor references. The
`dist/engine-assets/` subtree contains projected engine assets:

```text
dist/
  soul.descriptor.json
  engine-assets/
    workspace/
    skills/
    mcp/
      codex/config.toml
      claude-code/.mcp.json
```

## SDK Responsibilities

`packages/soul-app-sdk` owns:

- author-facing declarations;
- convention discovery;
- descriptor generation;
- descriptor validation;
- engine asset discovery;
- SDK-standard worker configuration model;
- build output under `dist/`.

The SDK builds the descriptor and the projected engine assets. It does not build a
Soul workbench, a Soul UI, or an app-owned API; those are not part of the Soul
contract. The Worker owns and renders the Workbench from `apps/worker-web`.

## Engine Assets

Workspace files, skills, native MCP files, and entry files are authored by the
Soul and projected at runtime by engine projection.

author-owned native MCP files may contain literal secrets

AIWorker validates syntax and target names, derives lightweight non-secret
summaries, and projects native files. It must not copy secret-like values into
descriptor summaries, DB, receipts, logs, diagnostics, inspect output, or
UI.

## Freeform V1

`souls/aiworker-freeform` is the v1 acceptance Soul. It has:

- soul id `aiworker-freeform`;
- display name `AIWorker Freeform`;
- one minimal projected skill;
- Codex native MCP placeholder at `engine/mcp/codex/config.toml`;
- Claude Code native MCP placeholder at `engine/mcp/claude-code/.mcp.json`;
- one projected entry file `AGENTS.md`.

Freeform must use SDK authoring, descriptor-only install, projection, engine
bridge, and session-level follow-up. The session experience is the worker-owned
Workbench rendering the session chat over the Freeform workspace. QA and HR
migrate later as samples.
