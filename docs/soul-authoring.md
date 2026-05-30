# AIWorker Soul Authoring

This document defines the canonical Soul App authoring contract.

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

Soul Apps live under `souls/*`.

Minimum useful layout:

```text
souls/my-soul/
  package.json
  soul.config.ts
  product/
    capabilities/
      default/
        prompt.md
  engine/
    workspace/
    skills/
    mcp/
      codex/
        config.toml
      claude-code/
        .mcp.json
```

Optional custom surfaces:

```text
souls/my-soul/
  web/
    mounted/
      index.html
      src/
  api/
    src/
```

## Convention Discovery

Convention discovery uses the common authoring path from:

```text
product/capabilities/*/prompt.md
product/workbench/index.tsx
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
sections it generated. `soul.config.ts` owns identity, version, display name,
compatibility overrides, explicit include/exclude choices, advanced build
overrides, and SDK module opt-ins. It must not become a Host integration file, a
handwritten descriptor, or arbitrary Host-readable configuration.

Build output is installed through descriptor references. The
`dist/engine-assets/` subtree contains projected engine assets:

```text
dist/
  soul.descriptor.json
  web/
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

`packages/soul-workbench` owns common workbench modules, common configuration UI,
skills/MCP UI, artifact primitives, mounted client helpers, and React components
for Soul workbench authors.

`packages/soul-app-runtime` owns standalone and Host-mounted runtime harnesses.

## Workbench

If a Soul App exposes a custom mounted workbench, Host mounts that one entry. If
it does not, Host mounts the SDK common workbench. Production runtime has one
resolved workbench.

Custom workbench code may compose SDK common modules. It may not create a second
Host-readable configuration system or ask Host chrome to render domain UI.

## Engine Assets

Workspace files, skills, native MCP files, and entry files are authored by the
Soul App and projected at runtime by engine projection.

author-owned native MCP files may contain literal secrets

AIWorker validates syntax and target names, derives lightweight non-secret
summaries, and projects native files. It must not copy secret-like values into
descriptor summaries, DB, receipts, logs, diagnostics, inspect output, or
UI.

## Freeform V1

`souls/aiworker-freeform` is the v1 acceptance Soul. It has:

- app id `aiworker-freeform`;
- soul id `freeform`;
- display name `AIWorker Freeform`;
- one default capability named `Freeform Session`;
- SDK common workbench;
- one minimal projected skill;
- Codex native MCP placeholder at `engine/mcp/codex/config.toml`;
- Claude Code native MCP placeholder at `engine/mcp/claude-code/.mcp.json`.

Freeform must use SDK authoring, descriptor-only install, projection, engine
bridge, session-level follow-up, and mounted routing. QA and HR migrate later as
samples.
