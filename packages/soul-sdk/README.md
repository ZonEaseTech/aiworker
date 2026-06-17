# AIWorker Soul SDK

`@zonease/aiworker-soul-sdk` is the authoring/build helper for AIWorker Souls.
A Soul is now a versioned Paseo workspace template: files that AIWorker can
project into a normal Paseo workspace directory.

Authoring shape:

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

`buildSoul(rootDir)` generates:

```text
dist/soul.descriptor.json
dist/workspace-template/**
```

The descriptor carries only `protocol`, `identity`, and `workspaceTemplate`.
It must not contain UI, API, runtime, provider credentials, or Paseo-specific
process state.
