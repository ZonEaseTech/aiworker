# Host/Soul micro-app boundary design

## Context

AIWorker's active architecture contract says Host is a Local Shell + Engine Bridge
for Soul Apps. Host owns start, shell, locate, mount and bridge. Soul Apps own
domain UI/API, app-owned workbench surfaces, domain state and product workflow.

The current implementation mostly follows the mounted micro-app path, but
`universal-workbench` has drifted into a Host-side special case: Worker Web imports
and renders the universal workbench React tree directly instead of mounting the
manifest-declared `/micro-app/workbench/universal` surface. This is not allowed.
`universal-workbench` is a Soul App capability surface, not a Host boundary.

This design strictly restores the boundary: Host and Soul stay decoupled, and
Host-to-mounted-UI communication goes through the micro-app runtime only.

## Goals

- Remove Host Web's `universal-workbench` special rendering path.
- Treat universal and domain-specific workbenches as equal Soul-owned
  manifest-declared micro-app routes.
- Keep the workbench switch in Worker Configuration's projection area, scoped to
  the specific Soul worker.
- Clarify that all Worker Configuration items, not only workbench selection, stop
  at the worker boundary. Workspace and session identifiers may be passed as
  opaque context for mounted Soul surfaces or engine bridge calls, but they are
  not Host configuration scopes.
- Preserve HR's domain-specific workbench route while allowing apps such as QA or
  custom to expose only universal workbench without a switch.
- Add tests and static guardrails so Host cannot re-import or re-render Soul
  workbench UI.

## Non-goals

- Do not redesign Host shell navigation.
- Do not introduce Host-owned action/search/proposal/review workbench controls.
- Do not make workbench selection a Soul-level or app-level global setting.
- Do not make any Worker Configuration item a Soul-level, app-level,
  workspace-level or session-level Host setting.
- Do not make Host interpret HR, QA or custom domain state.

## Boundary Rules

Host Web may:

- Read enabled Soul App manifests.
- Pick a manifest-declared `ui.routes` entry with `surface.renderer =
  "micro-app"`.
- Request `/api/local/apps/:appId/surfaces/:surfaceId`.
- Render the returned payload in the generic `<micro-app>` container.
- Pass narrow mount data through micro-app data APIs: `appId`, `surfaceId`,
  `workerId`, `workspaceId`, `sessionId`, `theme`, `routePrefix` and expiry
  metadata.
- Listen for lightweight child events: `ready`, `error` and `resize`.
- Track micro-app child route path for shell-level route restoration.

Host Web must not:

- Import `@zonease/aiworker-soul-app-workbench`.
- Branch on `route.id === "universal-workbench"`.
- Render universal workbench React components directly.
- Pass React props or callbacks into a Soul workbench surface.
- Translate `ui.workbench` descriptors into Host toolbar actions, Host search,
  Host configuration controls or Host product routes.
- Infer domain meaning from route ids, labels, protocol names, workbench UI, app
  files or app API responses.

Soul Apps own:

- `universal-workbench` when they choose to declare it.
- Domain-specific workbench routes such as HR's `hr-home`.
- The mounted service endpoints that serve `/micro-app/*` HTML.
- Workbench React state, session tree, composer, timeline and detail UI.
- App-owned mounted API paths used by their own micro-app UI.
- Domain actions, search, confirmations and output semantics.

## Workbench Routes

`universal-workbench` is not a Host fallback. It is a Soul App route:

```json
{
  "id": "universal-workbench",
  "path": "/workbench/universal",
  "surface": {
    "entry": "/micro-app/workbench/universal",
    "renderer": "micro-app",
    "scope": "app"
  }
}
```

Domain-specific workbenches are declared the same way. HR can expose both
`universal-workbench` and `hr-home`; QA and custom may expose only
`universal-workbench`. Host does not rank, interpret or specialize these routes.
It only mounts the worker-selected route.

`defineSoulApp` must not silently inject `universal-workbench` into manifests.
Reference apps and scaffolds may explicitly declare the route, but the manifest
must be the source of truth.

## Worker-Level Configuration Boundary

Worker Configuration is a Host shell surface for one Soul worker. It is not a
Soul App global settings surface, not a Soul-level capability editor and not a
shared domain configuration panel. It also is not a workspace or session
configuration surface.

Every configuration item shown in Worker Configuration must stay within the
current worker boundary:

- `worker-owned`: the value belongs to the current Soul worker and is keyed by
  worker id. Examples include the active workbench route id for that worker,
  worker overlay choices and worker-owned local enablement.
- `manifest-derived`: the value is read from the Soul App manifest or protocol
  descriptor. Host may display it as an option or status for the current worker,
  but must not treat it as mutable Host-owned global app configuration.
- `opaque context`: workspace or session ids may be present only as context that
  Host passes to mounted Soul surfaces or engine bridge calls. They do not create
  workspace-level or session-level Host configuration sections.

The same Soul App can have multiple Soul workers. Each worker has its own Worker
Configuration. A setting changed for one worker must not affect another worker
that uses the same Soul App unless the user explicitly performs a cross-worker
operation introduced by a separate design.

Host must not promote worker configuration into Soul-level configuration merely
because two workers share the same Soul App. Soul App authorship and manifest
changes belong in the owning app package or authoring workflow, not Worker
Configuration.

If a user needs to configure workspace or session behavior, that configuration
belongs inside the Soul-owned mounted micro-app or app-owned API. Host can mount
that Soul surface and pass opaque locator context, but Host does not expose or
persist workspace/session configuration fields in Worker Configuration.

## Worker-Scoped Workbench Selection

The workbench switch remains inside Worker Configuration's projection area. This
is a worker-level Host shell preference, not a Soul-level or app-level setting.

Rules:

- The switch is shown only when the selected worker's Soul App manifest exposes
  more than one micro-app workbench route.
- The switch is hidden when only one workbench route exists.
- Selection is keyed by worker id. Two workers using the same Soul App may choose
  different active workbench routes.
- The selected value is a route id only. Host stores no domain state and does not
  store app-owned workbench data.
- Changing the switch only changes which declared micro-app route Host mounts for
  that worker.
- If the selected route later disappears from the manifest, Host falls back to the
  first declared micro-app route for that worker without interpreting the route's
  domain semantics.

## Data Flow

1. Host Web resolves the active worker and that worker's enabled Soul App.
2. Host Web computes the worker-scoped active route id.
3. Host Web calls `resolveMountedSurface(appId, route.id, context)`.
4. Host API verifies the app is enabled and the surface id is manifest-declared.
5. Host API starts or reuses the mounted Soul App service.
6. Host API returns a micro-app payload with `name`, `url`, `data` and `surface`.
7. Host Web renders only `<micro-app>`.
8. Soul App mounted HTML reads `window.microApp.getData()` and subscribes with
   `window.microApp.addDataListener(...)`.
9. Soul App mounted HTML dispatches `ready`, `error` or `resize` through
   `window.microApp.dispatch(...)`.
10. If the workbench needs data, the Soul-owned micro-app calls app-owned mounted
    API paths through its `routePrefix`; Host proxies transport and does not
    interpret the domain payload.

## Error Handling

- If no micro-app workbench route is declared, Host shows the existing generic
  no-mounted-surface state.
- If a route is declared but the mounted service does not serve the route, Host
  displays the mount/load error for that route and does not fallback to a Host UI.
- If the child app dispatches `error`, Host displays the message without parsing
  domain meaning.
- If the child app never dispatches `ready`, Host may show loading/ready state
  only; it must not inspect child internals.
- If a worker-scoped selected route id is invalid, Host resets that worker to the
  first declared micro-app route.

## Tests And Guardrails

Required implementation checks:

- Worker Web test: `universal-workbench` renders as `<micro-app>`, not as
  `UniversalWorkbenchApp`.
- Worker Web test: no `route.id === "universal-workbench"` special branch is
  needed to show the route.
- Worker Web test: HR with universal plus domain route shows the Worker
  Configuration projection switch.
- Worker Web test: QA/custom with only universal route does not show the switch.
- Worker Web test: workbench selection is keyed by worker id, so same-Soul
  workers can have different active routes.
- Boundary script: `apps/web` must not import
  `@zonease/aiworker-soul-app-workbench`.
- SDK test: `defineSoulApp` does not silently inject universal workbench.
- Soul App mounted tests: every declared `/micro-app/*` route in HR, QA and
  custom manifests is served by the app's mounted service.
- API/Web tests: Host returns mounted surface payloads only for declared surfaces
  and does not expose Host workbench action/search product APIs.

Focused validation should include:

```bash
bun scripts/check-soul-app-boundaries.ts --completion-audit
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-soul-app-sdk' test
bun run --filter '@zonease/aiworker-soul-app-runtime' test
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
```

Run `bun run ui:check` if the Worker Configuration projection switch or mounted
workbench visuals change.

## Acceptance Criteria

- Host Web has no direct dependency on `@zonease/aiworker-soul-app-workbench`.
- Universal workbench is mounted through the same `<micro-app>` path as every
  other Soul-owned workbench route.
- HR can switch between universal and HR domain workbench in Worker
  Configuration's projection area.
- QA/custom with only universal workbench have no switch.
- Workbench selection is scoped per worker, not per Soul App.
- Host/Soul UI communication uses micro-app data/events only.
- Host does not special-case universal workbench, interpret domain state, or
  provide fallback workbench UI.
