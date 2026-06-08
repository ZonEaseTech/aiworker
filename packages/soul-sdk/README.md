# AIWorker Soul SDK

`@zonease/aiworker-soul-sdk` is the descriptor authoring and build surface for
Souls under `souls/*`. A Soul is a descriptor-only template of engine assets;
the SDK no longer authors a workbench.

The default authoring shape is:

```text
souls/my-soul/
  soul.config.ts
  engine/workspace/
  engine/skills/
  engine/mcp/codex/config.toml
  engine/mcp/claude-code/.mcp.json
```

`buildSoul(rootDir)` generates `dist/soul.descriptor.json` and packaged assets.
The descriptor carries only `protocol`, `identity`, and `engine`. Worker runtime
consumes the built descriptor and refs only; it does not import Soul source.
