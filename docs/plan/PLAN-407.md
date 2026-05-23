# PLAN-407 Universal workbench engine readiness wiring

- **status**: completed
- **createdAt**: 2026-05-23
- **approvedAt**: 2026-05-23
- **completedAt**: 2026-05-23
- **relatedTask**: BUG-151

## Context

Root-cause investigation found the false positive in the mounted universal
workbench client:

- `client-entry.tsx` passes `engineReadiness={{ detail: 'Engine bridge ready',
  label: 'Engine bridge', ready: true }}`.
- Session creation and continuation routes in the daemon call
  `loadLocalSettings()` and choose the selected engine from those settings.
- `/api/local/settings` exposes that same local settings object to Host Web.
- `packages/soul-app-workbench` already owns
  `resolveEngineReadiness(settings, copy)`, which covers loading state, BYOK
  configuration, missing engine ids and uninstalled local CLI engines.

The most appropriate mounted data source is therefore the generic Host local
settings endpoint, not a new Host-rendered workbench branch and not a
Soul-domain configuration field.

## Proposal

1. Add failing tests for the mounted client readiness loader:
   - it fetches `/api/local/settings`;
   - uninstalled selected engines return `ready: false`;
   - installed selected engines return real selected engine labels/details.
2. Add a focused render test proving the shared workbench disables the composer
   and displays the readiness detail when `ready: false`.
3. Wire the mounted client to keep readiness false while loading, then load
   `/api/local/settings` and pass `resolveEngineReadiness(...)` into
   `UniversalWorkbenchApp`.
4. Keep the copy local to the workbench package, matching the existing English
   universal workbench literals.
5. Preserve the current Host/Soul boundary: Host provides generic settings and
   engine bridge metadata; the mounted workbench consumes it without importing
   Host Web source.

## Component Library Preflight

Existing primitives already cover this change:

- `ManagedSessionComposer` handles disabled state and disabled reason.
- `UniversalWorkbenchApp`, `SessionChatView` and `SessionDetail` already pass
  `engineReadiness` to the composer surfaces.

No new app-local UI primitive, focus trap, custom icon import or style token is
needed.

## Scope

- `packages/soul-app-workbench`
- `docs/task/BUG-151.md`
- `docs/plan/PLAN-407.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Risks

- The mounted workbench client runs in the Host origin. Fetching
  `/api/local/settings` is appropriate for generic engine bridge state, but it
  should not expand into Soul domain configuration reads.
- A settings fetch failure must keep the composer disabled rather than falling
  back to optimistic readiness.
- Existing dirty event replay tests in the workbench/runtime area may require
  their already-requested client helper exports before package verification can
  pass.

## Alternatives

- Pass readiness through micro-app host data. Rejected for this slice because
  it would require Host Web to compute universal workbench-specific readiness
  and would duplicate the existing settings endpoint.
- Leave the composer enabled and let session turn submission fail. Rejected
  because the UI already has first-class readiness messaging and composer
  disabled-state support.
- Add a new mounted app API route for readiness. Rejected because the generic
  Host settings route is already the source used by the execution path.

## Verification Plan

- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Implemented the mounted readiness wiring in
`packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`.
The mounted client now:

- initializes readiness as `Checking execution settings...`;
- fetches `/api/local/settings`;
- reuses `resolveEngineReadiness(...)`;
- keeps the composer disabled for missing settings, unconfigured BYOK, unknown
  engine ids and uninstalled selected local engines;
- shows the selected engine/provider label and ready detail when settings are
  ready.

Focused tests cover uninstalled local CLI readiness, ready local CLI readiness,
unconfigured BYOK readiness and disabled composer rendering. The implementation
does not add a Host Web universal workbench branch or import Host Web source
from the Soul-owned mounted client.
