# FEAT-091 Soul App MCP Client And Server Contract

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-16
- **plan**: PLAN-334
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-mcp-client-server-contract.md
- **relatesTo**: packages/shared, packages/core, packages/soul-app-runtime, docs/soul-app-developer.md

## Context

Phase 1 added `engineAssets.mcpClients` and `engineAssets.mcpServers` schema
placeholders, but runtime projection still handles only workspace files and
native skills. Phase 4 turns MCP client/server declarations into an enforceable
contract without making MCP servers private to one Soul workflow.

## Goals

- Project declared MCP client config through Codex and Claude Code target
  adapters.
- Project only the selected supported engine target's client config.
- Keep generated MCP client config free of literal secrets.
- Validate MCP server package declarations as generic MCP packages.
- Document that Soul Apps may declare MCP use, while executable MCP servers
  remain generic `packages/mcp-*` style packages.

## Non-Goals

- Do not implement a real MCP server package.
- Do not merge with user/global Codex or Claude Code config.
- Do not migrate `aiworker app create`; that is Phase 5.
- Do not change external engine login/auth behavior.

## Acceptance Criteria

- Runtime projects Codex MCP client config to `.codex/config.toml`.
- Runtime projects Claude Code MCP client config to `.mcp.json`.
- Runtime skips MCP client projection when the worker default engine is not a
  supported target.
- Projection receipt records `mcp-client` entries with `engineTarget`.
- Manifest validation rejects non-generic MCP server package names.
- Docs describe the MCP package boundary and secret rule.

## Verification

- `bun test packages/shared/src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Claimed after FEAT-090 / PLAN-333 checkpoint.
- 2026-05-16: Completed. MCP client config now projects through Codex and
  Claude Code adapters, MCP server packages are validated as generic MCP
  packages, and Phase 4 verification passed.
