# {{workerName}} Workspace Instructions

This workspace belongs to an AIWorker Custom sandbox.

## Workspace Identity

- Soul worker: {{workerName}}
- Soul id: {{soulId}}
- Workspace: {{workspaceName}}

## Session Output

- Write durable session outputs under `artifacts/<sessionId>/`.
- This is a free-form exploration workspace. No fixed domain constraints apply.
- Available skills come from Worker Configuration overlay. When skills exist, use `.agents/skills/` or `.claude/skills/` according to the active engine.
- MCP client config comes from Worker Configuration overlay (`.codex/config.toml` or `.mcp.json`).

## Overlay-First Workflow

- This workspace has no built-in domain skills or MCP config.
- All skills, MCP clients, and entry files are injected through Worker Configuration.
- Use `aiworker worker configuration` or the Host Web Shell to manage overlays.
- Run workspace projection after changing overlay assets.
