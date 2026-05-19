# FEAT-104 MCP legacy cleanup before workspace binding

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **plan**: PLAN-378
- **relatesTo**: FEAT-091, REFACTOR-050, FEAT-049

## Background

The next MCP implementation discussion exposed a high-risk drift vector:
historical memory and audit-trail documents still mention project-scope
`.aiworker`, `executor mcp ...` commands, and
`.aiworker/executor-capabilities.json`. Those concepts were valid in older
iterations, but the current product contract has moved to a host-local daemon,
Soul workers, workspaces and sessions.

Because AIWorker is agent-driven, stale memory or stale documentation can steer
future agents toward an obsolete MCP landing path.

## Acceptance Criteria

- Active architecture and authoring docs explicitly route new MCP work through
  Host-owned workspace MCP binding, not project-scope executor overlays.
- Soul App MCP server guidance distinguishes generic MCP packages from
  vertical/app-owned local MCP servers.
- Legacy executor overlay schema/exports are either removed from the current
  public surface or marked strongly enough that agents do not treat them as a
  current design entrypoint.
- Settings MCP UI/API placeholders are either connected to the new binding
  model or labeled/contained so they cannot be mistaken for a completed
  workspace MCP management feature.
- PMA docs and changelog record the cleanup boundary before real MCP landing
  work begins.
- Focused docs/schema/UI verification and code-review-graph review pass before
  closure.

## Notes

- User authorized a Codex memory correction note on 2026-05-19.
- This task is a gate before implementing workspace MCP binding.
- The task must not revive `executor mcp ...` commands or project-scope
  `.aiworker` initialization.

## Outcome

- Active architecture now defines Host-owned workspace/session MCP binding as
  the MCP landing path and explicitly rejects project-scope `.aiworker`,
  `.aiworker/executor-capabilities.json`, and historical `executor mcp ...`
  entrypoints as current design sources.
- Soul App authoring guidance now separates reusable `engineAssets.mcpServers`
  packages from vertical/app-owned local MCP servers that live with their owning
  product/app and are enabled through workspace binding.
- Legacy executor capability schemas remain exported for compatibility but are
  marked deprecated and documented as historical overlay/compat schemas.
- Worker Settings MCP controls and local settings persistence are contained as
  pending workspace-binding surfaces; API normalization prevents the placeholder
  MCP settings from becoming enabled until real binding exists.

## Verification

- `bun apps/cli/src/aiworker.ts commands --all`
- `bun scripts/check-doc-contract.ts`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run ui:check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
