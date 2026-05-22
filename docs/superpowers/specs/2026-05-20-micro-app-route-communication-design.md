# micro-app Route Communication Design

## Goal

Use the native `@micro-zoe/micro-app` router API for Host-mounted Soul App route
communication. The first implementation slice focuses on HR because HR already
has one app-owned mounted route surface: `hr-home`.

The route contract should let Host open or observe a child route without
remounting the Soul App surface and without moving HR domain routing logic back
into Host Web.

## Sources

- micro-app base app API:
  <https://jd-opensource.github.io/micro-app/docs.html#/zh-cn/api/base-app>
- micro-app child app API:
  <https://jd-opensource.github.io/micro-app/docs.html#/zh-cn/api/child-app>
- micro-app router guide:
  <https://jd-opensource.github.io/micro-app/docs.html#/zh-cn/router>
- AIWorker mounted UI boundary:
  `docs/architecture.md#constraint-registry`
- Existing mounted-surface design:
  `docs/superpowers/specs/2026-05-20-micro-app-host-soul-mounted-surface-design.md`

## Decision

Route communication is router-first:

- Host-to-child route changes use `microApp.router.push` or
  `microApp.router.replace`.
- Host observes child route changes with `microApp.router.afterEach` and reads
  current child state with `microApp.router.current.get(name)`.
- The micro-app data channel remains only for mount context and lightweight UI
  events that are not routes: theme, worker id, workspace id, session id,
  ready, error and resize.
- Business actions, storage, search, connector access and permissions remain in
  the existing action/search/broker/protocol paths.

This removes the need for custom `route:changed` or `route:navigate` data
events. micro-app already owns child route navigation, so AIWorker should not
build a second route protocol on top of the data channel.

## HR Route Model

Host mounts HR once:

```text
surface id: hr-home
manifest path: /hr
mounted entry: /micro-app/routes/hr-home
micro-app name: aiworker-hr--hr-home
router mode: pure
base route: /hr
```

HR owns the child routes under `/hr`:

```text
/hr
/hr/profiles/:profileId
/hr/profiles/:profileId/review-patch
/hr/profiles/new
```

The Host route continues to describe platform scope:

```text
/workers/:workerId
/workers/:workerId/workspaces/:workspaceId
/workers/:workerId/workspaces/:workspaceId/sessions/:sessionId
```

The HR child route describes the app-owned page inside the mounted workbench.
These two route layers are coordinated, not merged.

## Host Behavior

Host renders a single mounted element for HR:

```tsx
<micro-app
  name="aiworker-hr--hr-home"
  url="/api/local/apps/aiworker-hr/micro-app/routes/hr-home?workerId=...&workspaceId=..."
  router-mode="pure"
  baseroute="/hr"
  destroy
/>
```

When Host needs to open an HR page, it targets the child router:

```ts
microApp.router.push({
  name: 'aiworker-hr--hr-home',
  path: '/hr/profiles/profile-ben',
})
```

When Host changes workspace context, it sends the normal mount context update and
then uses child router replacement:

```ts
microApp.router.replace({
  name: 'aiworker-hr--hr-home',
  path: lastHrRouteForWorkspace ?? '/hr',
})
```

Host should keep a small route memory keyed by app, surface and workspace:

```text
appId + surfaceId + workspaceId -> child path
```

The memory is UI state only. It is not an HR profile index, and it must not be
treated as authoritative domain state.

## Child Behavior

HR may use its own router inside the mounted app. Selecting a profile changes
the child route, for example from `/hr` to `/hr/profiles/profile-stella`.

Host observes the child route through micro-app router hooks. It may update
breadcrumbs, diagnostics or the per-workspace last-child-route memory, but it
must not infer profile facts from the path.

If the HR route does not exist or the child router rejects a path, the app should
fall back to `/hr` and surface a local app-owned error state when useful.

## Data Channel Boundary

The data channel remains narrow mount context:

```text
appId
surfaceId
surfaceKind
surfaceScope
theme
routePrefix
workerId
workspaceId
sessionId
mountTokenPresent
```

The child may still dispatch these UI events:

```text
ready
error
resize
action request
```

The route design deliberately does not add `route-change` or `route-navigate`
events to this channel. Route state belongs to `microApp.router`.

An action request is only a UI request to invoke an existing manifest-declared
workbench action. The data channel does not execute business behavior itself.

## Protocol And Broker Boundary

Router paths are not business capabilities. A child route can show the profile
detail page, but creating a profile, writing a draft, querying search or using a
connector still goes through declared action/search/broker/protocol surfaces.

This keeps three layers separate:

```text
mounted route navigation -> microApp.router
mount context and UI readiness -> micro-app data channel
business state and platform capabilities -> protocol/broker
```

## Error Handling

- If the mounted element is not ready, Host queues or retries one navigation
  after the child route appears in `microApp.router.current`.
- If route navigation fails or resolves to an unknown child path, Host replaces
  with `/hr`.
- If workspace context changes while a child route points at a workspace-specific
  resource, Host replaces with that workspace's remembered route or `/hr`.
- If the mounted service is unavailable, existing mounted surface errors remain
  responsible for the user-visible failure state.

## Non-Goals

- Do not use the data channel to reimplement router events.
- Do not expose the full Host router to HR with `setBaseAppRouter` in the first
  slice.
- Do not put HR domain renderers or profile route interpretation in Host Web.
- Do not synchronize HR child routes into the browser URL in the first slice.
  Do not call `microApp.router.attachToURL` for this slice.
- Do not replace protocol/broker/action/search behavior with router messages.

## Validation

The implementation plan should prove:

- Worker Web renders HR with `router-mode="pure"` and a `baseroute` of `/hr`.
- Host can call `microApp.router.push` to open
  `/hr/profiles/:profileId` without remounting `hr-home`.
- Host observes child route changes and stores the latest child path per
  workspace.
- Workspace switching uses `router.replace` to restore a remembered child route
  or `/hr`.
- Existing mounted context data still reaches HR.
- Existing action/search/broker tests continue to prove business behavior stays
  outside the router channel.
