# PLAN-378 MCP legacy cleanup before workspace binding

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: FEAT-104

## Current State

Current repo evidence shows the active product path is host-local:

- `packages/fs-layout` no longer auto-detects or initializes arbitrary
  project-scope `.aiworker/` directories.
- The current CLI command index exposes `settings list` and `engine select`, but
  no `executor mcp ...`, `executor doctor`, or `executor select` commands.
- `docs/architecture.md` names `AGENTS.md` and `docs/architecture.md` as active
  normative sources; `docs/task`, `docs/plan`, `docs/superpowers` and
  `docs/changelog.md` are audit trail only.
- `packages/shared/src/executor-capabilities.ts` still exists and is exported,
  but its header says it is an overlay/bootstrap hint, not an effective
  capability source of truth.
- Worker Web Settings and local settings schemas contain MCP-looking fields
  (`externalMcpServers`, `localMcpServer`), but there is no workspace-scoped MCP
  binding model, storage table, CLI lifecycle or engine config materialization
  path behind them.
- `docs/soul-app-developer.md` currently says executable MCP servers are generic
  monorepo packages, which is too narrow for vertical/local-first MCP servers
  such as the TTPOS operations MCP sample.

## Proposal

Before implementing real MCP binding, clean the active contract and obvious
misleading surfaces:

1. Update active architecture and authoring docs to define workspace MCP binding
   as the future MCP landing path.
2. Split MCP server ownership guidance into:
   - generic MCP packages named by external system or reusable capability;
   - vertical/app-owned local MCP servers that stay outside AIWorker core but can
     be bound to a workspace through Host grants, secrets and audit.
3. Audit `executor-capabilities` exports and decide the smallest safe
   compatibility action:
   - remove from public barrel exports when no current consumer needs them; or
   - keep the file but add stronger legacy/deprecated naming and comments.
4. Contain Settings MCP placeholders until they are backed by real workspace
   binding:
   - mark them as local Host settings placeholders; or
   - remove/hide them from the visible Settings surface; or
   - wire them into the approved workspace MCP binding model in a later plan.
5. Record the cleanup in PMA docs and changelog so future agents have a clear
   before-MCP gate.

## Scope

Investigation and likely implementation scope after approval:

- `docs/architecture.md`
- `docs/soul-app-developer.md`
- `packages/shared/src/executor-capabilities.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/executor-capabilities.test.ts`
- `packages/shared/src/local-workspace.ts`
- `apps/api/src/modes/worker.ts`
- `apps/web/src/features/settings/components/settings-dialog.tsx`
- `apps/web/src/features/i18n/locales/*`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `docs/task/FEAT-104.md`
- `docs/plan/PLAN-378.md`
- `docs/changelog.md`

The final file list should stay smaller if investigation proves a narrower fix
is enough.

## Non-Goals

- No real workspace MCP binding implementation in this cleanup slice.
- No MCP server lifecycle manager, stdio/http process runner or health monitor.
- No TTPOS MCP server import into the AIWorker repository.
- No revival of project-scope `.aiworker` initialization.
- No revival of `executor mcp ...` command surfaces.
- No broad rewrite of historical PMA audit files.

## Risks

- Removing legacy exports may break downstream users that still import them.
  Mitigation: use `rg` and focused package tests first; keep compatibility if
  uncertainty remains.
- Hiding Settings MCP fields may regress visible UI tests. Mitigation: update
  tests to assert the intentional placeholder boundary.
- Documentation cleanup can overcorrect and erase useful historical context.
  Mitigation: active docs should state the current contract; audit docs should
  remain historical unless directly misleading from an active entrypoint.
- Future MCP work could still be polluted by external memory. Mitigation: a
  user-authorized memory correction note was added on 2026-05-19.

## Verification Plan

- `bun apps/cli/src/aiworker.ts commands --all`
- `bun scripts/check-doc-contract.ts`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run ui:check` if visible Settings UI changes remain in scope
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Implementation Notes

Completed on 2026-05-19 as the cleanup gate before real workspace MCP binding.

- `docs/architecture.md` now makes Host-owned workspace/session MCP binding the
  normative MCP landing path and labels project-scope executor overlays as
  historical compatibility only.
- `docs/soul-app-developer.md` now keeps generic reusable MCP server packages in
  `engineAssets.mcpServers` while routing vertical/app-owned local MCP servers
  to future workspace MCP binding.
- `packages/shared/src/executor-capabilities.ts` and the public barrel export
  are retained for compatibility but strongly marked deprecated.
- Soul App manifest validation messages now direct workflow-private MCP server
  package names to workspace MCP binding instead of engine assets.
- Worker Settings MCP controls are visible but disabled/pending, with copy that
  states they are not materialized to engines yet.
- Local daemon settings normalize placeholder MCP settings to disabled so the
  fake surface cannot silently become an active feature.

## Verification Result

Passed:

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

`crg:review` exited 0. It reported advisory test-gap labels across the full
dirty working tree, including parallel FEAT-103 files, but the MCP cleanup path
is covered by focused shared/API/Web tests and typechecks.
