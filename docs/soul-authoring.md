# AIWorker Soul Authoring

A Soul is now a versioned Paseo workspace template.

## Minimal layout

```text
souls/my-soul/
  soul.config.ts
  engine/
    workspace/
      AGENTS.md
      CLAUDE.md
      business-context.md
      paseo.json
    skills/
      my-skill/
        SKILL.md
    mcp/
      codex/config.toml
      claude-code/.mcp.json
```

`aiworker soul build` produces:

```text
dist/
  soul.descriptor.json
  workspace-template/
    AGENTS.md
    CLAUDE.md
    skills/**
    .aiworker-mcp/**
```

The descriptor identifies the template and lists projected files. It does not describe UI, APIs, capabilities, sessions, workbench routes, or engine process behavior.

## Authoring rules

- Put behavioral guidance in `AGENTS.md` and/or `CLAUDE.md`.
- Put reusable procedures in skills.
- Put MCP config in provider-native project files.
- Do not put provider API keys in the Soul. Use provider profiles and secret references managed by the target Paseo environment.
- Do not add Soul UI or backend APIs; the employee works in Paseo.
