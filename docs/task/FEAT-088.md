# FEAT-088 Soul App Engine Assets Foundation

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-16
- **plan**: PLAN-331
- **spec**: docs/superpowers/specs/2026-05-16-soul-app-authoring-layout-v2-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-16-soul-app-engine-assets-foundation.md
- **relatesTo**: packages/shared, packages/soul-app-sdk, packages/soul-app-runtime, packages/core, apps/aiworker-hr, apps/aiworker-qa

## Context

Soul App authoring v2 adopts `engine-assets`, `product` and `host-adapter` as
the long-term app layout. Phase 1 establishes the engine asset foundation:
workspace seed files and native skills become app-owned source assets projected
by Host/runtime into each workspace.

The current workspace-root `AGENTS.md` / `CLAUDE.md` projection work under
FEAT-087 is still uncommitted in the working tree. This phase absorbs that
behavior and replaces hardcoded Markdown renderers with file-backed
`engine-assets/workspace` templates.

## Goals

- Add manifest and shared types for `engineAssets.workspace` and
  `engineAssets.skills`.
- Move HR workspace seed files and native skills under
  `apps/aiworker-hr/engine-assets`.
- Add QA workspace seed files under `apps/aiworker-qa/engine-assets` so all
  official app manifests satisfy the same engine asset contract.
- Project workspace files one-to-one into `workspaceRoot`.
- Project native skills from `engine-assets/skills` to Codex and Claude Code
  native skill targets.
- Write one projection receipt at `.aiworker/projections.json`.
- Make `packages/soul-app-runtime` materialize the same engine assets in
  standalone and mounted test runtimes.

## Non-Goals

- Do not migrate `product/` or `host-adapter/` in this phase.
- Do not implement MCP client adapters or MCP server package conventions in this
  phase.
- Do not keep the legacy `apps/aiworker-hr/skills` path as the documented
  source after this phase.

## Acceptance Criteria

- Creating an HR workspace projects `AGENTS.md`, `CLAUDE.md`, `README.md`,
  `.gitignore`, `evidence/README.md` and HR skills from `engine-assets`.
- `.aiworker/projections.json` records workspace-file and native-skill
  projection entries with source, target and sha256.
- `packages/shared`, `packages/soul-app-sdk`, `packages/soul-app-runtime` and
  `packages/core` tests cover the new contract.
- HR and QA app validation accepts the v2 engine asset layout.

## Verification

- `bun test packages/shared/src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-16: Claimed under goal-mode execution for Soul App authoring layout v2
  Phase 1.
- 2026-05-16: Completed Phase 1. Shared schema, SDK exports, core projection,
  Host wiring, standalone runtime parity, HR skill migration and official HR/QA
  workspace templates are implemented and verified.
- 2026-05-16: Code-review-graph completed with risk score 0.60 and static test
  gaps for `HostRuntime`, `createRuntimeForWorker`, `engineAssetSourceForWorker`,
  `bootstrapProfileWorkspace` and `existingBootstrapPaths`. The Host/runtime
  path is covered by `packages/core/src/host/runtime.test.ts` plus
  `packages/core/src/worker/runtime.test.ts`; no additional blocking defect was
  found.
