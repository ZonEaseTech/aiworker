# AIWorker Soul App SDK

`@zonease/aiworker-soul-app-sdk` is the descriptor authoring and build surface
for Soul Apps under `souls/*`.

The default authoring shape is:

```text
souls/my-soul/
  soul.config.ts
  product/capabilities/default/prompt.md
  engine/workspace/
  engine/skills/
  engine/mcp/codex/config.toml
  engine/mcp/claude-code/.mcp.json
```

`buildSoul(rootDir)` generates `dist/soul.descriptor.json` and packaged assets.
Host runtime consumes the built descriptor and refs only; it does not import
Soul source.
