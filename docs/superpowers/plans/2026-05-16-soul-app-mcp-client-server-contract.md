# Soul App MCP Client And Server Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 4 of Soul App authoring layout v2 by projecting MCP client config for supported engines and validating MCP server package declarations.

**Architecture:** Soul Apps own declarative MCP usage in `engineAssets`, but executable MCP servers stay generic packages. Runtime projects workspace-local engine client config only for the selected supported engine target and records that projection in `.aiworker/projections.json`. The Host never writes engine-global auth/config and never stores secrets in generated client config.

**Tech Stack:** TypeScript, Bun tests, zod manifest validation, local filesystem projection.

---

## File Map

- `packages/shared/src/soul-app/manifest.test.ts`: RED/GREEN tests for MCP server package conventions.
- `packages/shared/src/soul-app/manifest.ts`: manifest validation for generic MCP server package names.
- `packages/core/src/worker/runtime.test.ts`: RED/GREEN tests for Codex/Claude Code MCP client projection.
- `packages/core/src/worker/engine-assets.ts`: target adapters from app MCP client sources into workspace engine config files.
- `packages/core/src/worker/runtime.ts`: pass selected worker engine target and manifest engine assets into projection.
- `packages/core/src/host/runtime.ts`: pass installed app manifest `engineAssets` into worker runtime.
- `packages/soul-app-runtime/src/index.ts`: pass SDK app manifest `engineAssets` into standalone/mounted test runtime.
- `docs/soul-app-developer.md`: document the MCP client/server boundary.
- `docs/task/FEAT-091.md`, `docs/plan/PLAN-334.md`, `docs/changelog.md`: PMA closeout.

## Task 1: Shared Manifest MCP Server Contract

- [x] Add a failing test in `packages/shared/src/soul-app/manifest.test.ts` that validates a manifest with:
  - `engineAssets.mcpClients` for `codex` and `claude-code`;
  - `engineAssets.mcpServers[0].package = "@zonease/aiworker-mcp-ats"`;
  - `transport = "stdio"`;
  - `requiredPermissions = ["connector:read:ats"]`.
- [x] Add a failing test that rejects `engineAssets.mcpServers[0].package = "@zonease/aiworker-hr-candidate-screening-mcp"` with issue code `unsafe_mcp_server_package`.
- [x] Run `bun test packages/shared/src/soul-app/manifest.test.ts` and verify RED.
- [x] Implement `mcpServerPackageMessage()` in `packages/shared/src/soul-app/manifest.ts`.
- [x] Add `unsafe_mcp_server_package` to the manifest validation issue code union.
- [x] Run the shared manifest test and shared typecheck.

## Task 2: Runtime MCP Client Projection

- [x] Add a failing Codex projection test in `packages/core/src/worker/runtime.test.ts`:
  - create `engine-assets/mcp-clients/codex/config.toml`;
  - set manifest engine assets on `engineAssetSource`;
  - create a workspace with worker default engine `codex`;
  - assert `.codex/config.toml` exists and receipt has `kind: "mcp-client", engineTarget: "codex"`.
- [x] Add a failing Claude Code projection test:
  - create `engine-assets/mcp-clients/claude-code/.mcp.json`;
  - create a worker default engine `claude-code`;
  - assert `.mcp.json` exists and `.codex/config.toml` is not projected.
- [x] Add a failing unsupported-engine test:
  - create both client sources;
  - create worker default engine `http`;
  - assert no `mcp-client` receipt entries.
- [x] Add a failing literal-secret test:
  - write a client config containing `token = "sk-test-literal-secret"`;
  - assert workspace creation rejects it.
- [x] Run `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts` and verify RED.
- [x] Extend `EngineAssetSource` and `EngineAssetProjectionInput` with optional `engineAssets` and `engineTarget`.
- [x] Implement `resolveSoulAppEngineTarget(engineId)` for `codex`, `claude-code`, `codex/default` and `claude-code/default`.
- [x] Implement `projectMcpClients()` in `packages/core/src/worker/engine-assets.ts`.
- [x] Add target adapters:
  - Codex source file `config.toml` -> workspace target `.codex/config.toml`;
  - Claude Code source file `.mcp.json` -> workspace target `.mcp.json`.
- [x] Add a minimal literal secret guard for MCP client config content.
- [x] Run the core runtime test and core typecheck.

## Task 3: Host And Runtime Wiring

- [x] Update `packages/core/src/host/runtime.ts` so `engineAssetSourceForWorker()` passes `app.manifest.engineAssets`.
- [x] Update `packages/core/src/worker/runtime.ts` so `prepareWorkspaceLayout()` passes `resolveSoulAppEngineTarget(worker.defaultEngineId)` into projection.
- [x] Update `packages/soul-app-runtime/src/index.ts` so `createRuntimeForApp()` passes `input.app.manifest.engineAssets`.
- [x] Run:
  - `bun run --filter '@zonease/aiworker-core' test`
  - `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
  - `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`

## Task 4: Docs And Phase Closeout

- [x] Update `docs/soul-app-developer.md` with:
  - `engine-assets/mcp-clients/codex/config.toml`;
  - `engine-assets/mcp-clients/claude-code/.mcp.json`;
  - generic `packages/mcp-*` or `@zonease/aiworker-mcp-*` server naming;
  - no literal secrets in manifest or generated engine client config.
- [x] Mark FEAT-091 and PLAN-334 completed.
- [x] Add a changelog entry for FEAT-091 / PLAN-334.
- [x] Run:
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

## Self-Review

- Spec coverage: Phase 4 MCP client adapters, MCP server package convention, selected-engine projection and secret-free generated config all map to tasks.
- Intentional gap: `aiworker app create` and validator legacy `src/` scan stay in Phase 5, matching the spec's scaffold/docs/legacy removal phase.
- Placeholder scan: no TBD or open-ended implementation steps remain.
