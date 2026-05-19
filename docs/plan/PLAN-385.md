# PLAN-385 Host platform settings and Soul App configuration boundary

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: BUG-146

## Current State

`docs/architecture.md` already distinguishes Host settings from Soul
App-owned app-specific settings. The table says Host owns global appearance,
language, default engine, local MCP and connector settings, while Soul Apps own
app-specific settings exposed through protocol.

The code still uses the same product word and UI mental model for both layers:

- `packages/shared/src/soul-app/manifest.ts` exposes
  `ui.workbench.settings`.
- HR/QA manifests and shared fixtures use `settings.open` actions.
- `apps/api/src/modes/worker.ts` resolves the descriptor as a normal workbench
  action.
- `apps/web/src/worker/worker-studio.tsx` pushes the descriptor into workbench
  actions with `role: "settings"`.
- `apps/web/src/worker/souls/hr/people-workbench/index.tsx` calls the app
  action and then opens the Host `SettingsDialog` when the role is `settings`.

That means the protocol does contact the Soul App first, but the visible
outcome still lands the operator in Host platform settings.

## Component Library Preflight

- Checked `packages/component`: the changed UI uses existing button/icon
  primitives and status rendering in Worker Web. No new generic primitive is
  needed.
- Checked `packages/component/src/catalog.ts`: no reusable component gap is
  introduced because this slice changes protocol semantics and existing button
  labels, not a new repeated UI pattern.
- App-local UI changes are limited to HR workbench role handling and status
  display through the existing workbench bridge. No app-local CSS should be
  needed unless tests reveal a status layout issue.
- `bun run ui:check` remains required because Worker Web UI files change.

## Proposal

1. Change the shared Soul App workbench contract:
   - `ui.workbench.settings` becomes `ui.workbench.configuration`;
   - `SoulAppWorkbenchSettings` becomes app configuration naming;
   - the workbench action role becomes `configure` when the Host Web bridge
     maps the descriptor into a clickable command.
2. Update all current producers and consumers:
   - official HR/QA manifest JSON;
   - shared HR/QA fixture manifests;
   - CLI scaffold manifest and README text;
   - CLI mounted smoke action selection;
   - daemon generic action resolution;
   - security review descriptor surface.
3. Update Worker Web behavior:
   - map `configuration` into a `configure` workbench action;
   - render it with the settings icon but label it as app configuration;
   - on HR workbench click, invoke the app protocol action and show the app
     result/status instead of opening Host settings;
   - keep Host fixed chrome actions opening the platform settings dialog.
4. Rename Host-facing copy where it identifies the global settings surface:
   - dialog title/kicker/subtitle should say Platform Settings / AIWorker
     platform;
   - accessibility labels for fixed Host settings controls should say Platform
     Settings.
5. Update docs:
   - architecture constraint text for the three-layer boundary;
   - Soul App developer docs and SDK README;
   - PMA task, plan and changelog.

## Risks

- This is a breaking manifest contract rename. It is acceptable before 1.0.0,
  and avoids keeping a legacy alias that would preserve the ambiguity.
- Some historical Superpowers specs and plans still mention
  `ui.workbench.settings`. They are audit history and should not be rewritten.
- Host platform settings still remain under `/api/local/settings`; renaming the
  API would widen the blast radius without changing the user-visible boundary.
- HR/QA configuration actions are still placeholders. The acceptance target is
  correct ownership and invocation, not full domain configuration UI.

## Scope

- `packages/shared/src/soul-app/manifest.ts`
- `packages/shared/src/soul-app/fixtures.ts`
- `packages/shared/src/soul-app/manifest.test.ts`
- `packages/shared/src/soul-app/registry.test.ts`
- `packages/core/src/soul-app/security-review.ts`
- `packages/core/src/soul-app/registry.test.ts`
- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `apps/web/src/features/local-workspace/api/types.ts`
- `apps/web/src/features/i18n/*`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `apps/aiworker-hr/soul-app.manifest.json`
- `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- `apps/aiworker-hr/host-adapter/index.test.ts`
- `apps/aiworker-qa/soul-app.manifest.json`
- `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`
- `apps/aiworker-qa/host-adapter/index.test.ts`
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/aiworker.test.ts`
- `docs/architecture.md`
- `docs/soul-app-developer.md`
- `packages/soul-app-sdk/README.md`
- `docs/changelog.md`

## Verification Plan

- [x] RED: focused WorkerStudio test proves app configuration no longer opens
  Host Platform Settings.
- [x] GREEN: implement protocol rename and Worker Web behavior.
- [x] `bun run --filter '@zonease/aiworker-shared' test`
- [x] `bun run --filter '@zonease/aiworker-core' test src/soul-app/registry.test.ts`
- [x] `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-hr' test`
- [x] `bun run --filter '@zonease/aiworker-qa' test`
- [x] `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- [x] `bun run --filter '@zonease/aiworker-shared' typecheck`
- [x] `bun run --filter '@zonease/aiworker-core' typecheck`
- [x] `bun run --filter '@zonease/aiworker-api' typecheck`
- [x] `bun run --filter '@zonease/aiworker-cli' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' lint`
- [x] `bun run ui:check`
- [x] `bun run check`
- [x] `bun run docs:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Annotations

- 2026-05-19 20:19 CST: Plan created after user authorized goal-mode
  execution. The chosen route is a breaking pre-1.0 contract rename instead of
  a compatibility shim because the old `settings` name is itself the boundary
  leak.
- 2026-05-19 20:29 CST: Implementation completed. Host Platform Settings stay
  under Host chrome and `/api/local/settings`; Soul App configuration uses
  app-owned descriptors and mounted protocol actions.
- 2026-05-19 22:16 CST: Renumbered from `PLAN-376` during Session Kit merge
  because `codex/session-kit` already used `PLAN-376` for the shared Session
  Kit extraction.
