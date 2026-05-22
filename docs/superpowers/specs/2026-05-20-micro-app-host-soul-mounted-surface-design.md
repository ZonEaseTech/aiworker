# micro-app Host/Soul Mounted Surface Design

## Goal

Use `@micro-zoe/micro-app` as the single Host-mounted Soul App UI runtime. Host Web mounts Soul App surfaces through micro-app, while Soul Apps keep domain UI, domain state, protocol handlers, and product semantics inside their own app packages.

## Boundary

Host remains the platform shell. It may discover, start, resolve, and mount a Soul App surface declared in the manifest. It must not import app-owned `src` files, render app-domain React components, infer profile/release state, or keep app-specific renderer directories under `apps/web/src/worker/souls`.

Soul App remains the domain owner. It serves mounted UI entries from its `host-adapter/mounted` service, receives Host context through micro-app data, dispatches narrow UI events upward, and performs real domain actions through protocol endpoints.

micro-app is the UI runtime boundary, not the permission system. Permissions, grants, mount tokens, broker access, action/search/review/profile semantics, and audit behavior remain in Host/Soul protocol code.

## Runtime Contract

Mounted surface descriptors use `renderer: "micro-app"` for app-owned UI. `host-descriptor` remains for JSON descriptor surfaces. `trusted-module` and `sandboxed-frame` are removed from the active official app path.

Host resolves a micro-app surface through:

```text
Host Web -> GET /api/local/apps/:appId/surfaces/:surfaceId?theme=:theme
  -> Host daemon checks manifest + grants
  -> Host daemon starts or finds the mounted Soul App service
  -> Host daemon returns { microApp: { name, url, data }, surface }
  -> Host Web renders <micro-app name url destroy>
  -> Host Web assigns element.data = microApp.data
```

The micro-app name is stable and scoped by app and surface, for example `aiworker-hr--hr-home`. The URL points to the Soul App mounted service through the Host proxy namespace, for example `/api/local/apps/aiworker-hr/micro-app/routes/hr-home?theme=dark`.

## Data Contract

Host sends only mount context:

- `appId`
- `surfaceId`
- `surfaceKind`
- `surfaceScope`
- `theme`
- `routePrefix`
- `workspaceId`
- `workerId`
- `sessionId`
- `mountTokenPresent`

Soul App dispatches only lightweight UI events upward:

- `ready`
- `route-change`
- `refresh-requested`
- `action-requested`
- `error`

Domain data stays behind protocol surfaces. If Host needs real state, the Soul App must expose an action, search provider, descriptor, status, review summary, or profile artifact reference.

## Styling And Theme

micro-app starts with JS sandbox and scoped CSS enabled. Host Web does not disable sandbox or scoped CSS. Soul App mounted HTML sets light/dark classes from Host context and imports app-owned shadcn/Tailwind output. Host passes theme tokens through context and query parameters; it does not share raw CSS files by importing app sources.

## Package And File Ownership

Host-owned work:

- `packages/shared/src/soul-app/manifest.ts`
- `packages/shared/src/soul-app/fixtures.ts`
- `apps/api/src/modes/worker.ts`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/features/local-workspace/api/*`
- `apps/web/package.json`
- Host/API/Web tests

Soul-owned work:

- `apps/aiworker-hr/soul-app.manifest.json`
- `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- `apps/aiworker-qa/soul-app.manifest.json`
- `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`
- HR/QA app tests and smoke validation

## Validation

Acceptance requires:

- manifest tests reject stale `sandboxed-frame` declarations and accept `micro-app` entries under `/micro-app/*`
- API tests prove `micro-app` surfaces return a micro-app mount payload after permission checks
- Web tests prove Host renders `<micro-app>` and passes theme/context data without app-specific renderers
- HR and QA `app validate` and smoke flows pass
- boundary checks continue to reject `apps/web/src/worker/souls`
- UI checks and typechecks pass for touched packages
