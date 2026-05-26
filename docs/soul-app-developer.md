# Soul App Developer Quickstart (Frozen)

This file is a frozen quickstart during product shaping.
It is not an architecture contract.
It must not grow into a second Host/Soul App boundary guide.

The only active Host/Soul App contract is `docs/architecture.md#constraint-registry`.
If this file conflicts with `docs/architecture.md` or `AGENTS.md`, the
architecture contract wins.

## Do Not Expand Here

Do not expand Host/Soul boundary, descriptor, MCP, provider, permission, review, memory, Worker Configuration or configuration semantics here.

Put active boundary rules in `docs/architecture.md#constraint-registry`. Keep
historical exploration in `docs/task`, `docs/plan`, `docs/superpowers` or
`docs/changelog.md` as audit trail only.

## Current Authoring Loop

```bash
aiworker app create <app-id> --dir <target-dir>
aiworker app validate <target-dir>
aiworker app smoke <target-dir>
```

## Package Shape

```text
apps/<app-id>/
  soul-app.manifest.json
  engine-assets/
  product/
  host-adapter/
```

Use `.agents/skills/aiworker-soul-app-dev/SKILL.md` for route selection before
touching Soul App packages or public authoring files. Use
`.agents/skills/aiworker-host-dev/SKILL.md` when a change belongs to Host
platform behavior, daemon API, CLI lifecycle, Worker Web Shell, storage
metadata, Host runtime, app registry or Host/Soul protocol implementation.
