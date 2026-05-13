# Soul App Protocol Interaction Closure Design

## Decision

The next AIWorker milestone should close the local-first Host / Soul App product
loop by making app-declared shell actions, search, and app settings callable
through one generic protocol surface.

The target contract is:

```text
Host renders app-declared shell intent.
Host invokes only app-declared protocol actions/search/settings.
Soul App owns the result meaning and domain state changes.
```

This is the missing step after `FEAT-072 / PLAN-304`: Host can already discover
and render app-owned shell descriptors, but Worker Web still disables shell
actions because Host has no generic invocation route.

## Scope

This milestone is the **local-first protocol interaction closure**. It should
make the reference HR and QA apps usable inside Host without introducing
Host-owned HR/QA domain behavior.

It includes:

- generic Host API routes for app-declared shell actions;
- generic Host API routes for app-declared search providers;
- generic app settings invocation through the same action path;
- HR and QA mounted-service handlers for their declared shell actions and search;
- Worker Web wiring for clickable shell actions, app-owned search results, and
  app settings intent;
- PMA tracking, verification, browser smoke, code-review-graph, and conventional
  commit closeout.

It does not include:

- real Logto integration;
- real S3, GCP bucket, vault, or external object-store provider implementation;
- cross-app orchestration;
- remote control plane, marketplace, gateway, or fleet;
- app-owned profile/release data persistence beyond the minimal reference app
  behavior needed to prove protocol flow;
- Host-defined HR/QA fields, profile composition, release gate logic, or review
  meaning.

## Why This Exists

Host is justified only when it provides platform capabilities and a standard
location for Soul Apps. A disabled shell action is a half-finished location:
the operator can see that HR exposes “New people profile” or QA exposes “New
release gate”, but cannot use it.

Making those buttons work must not regress into hard-coded Host behavior.
The button click should be:

```text
Worker Web
  -> Host generic action endpoint
  -> validate app lifecycle + manifest declaration + grants
  -> mounted Soul App protocol handler
  -> app-owned result
  -> Host/Web render generic result envelope
```

Host still does not know what a people profile or release gate means.

## Interaction Surfaces

### Shell Actions

Host should expose:

```text
POST /api/local/apps/:appId/actions/:actionId
```

`actionId` is the manifest shell action id, not the domain command name. Host
must resolve the action from:

- `manifest.ui.shell.primaryAction`;
- `manifest.ui.shell.actions`;
- `manifest.ui.shell.settings`.

The resolved descriptor contains the Soul App-owned `protocolAction`, such as
`peopleProfiles.create` or `releaseGates.create`.

Host must reject:

- unknown apps;
- disabled apps;
- action ids not declared in the manifest shell descriptor;
- actions whose required permissions are not granted;
- attempts to invoke arbitrary action paths or undeclared protocol names.

The request body is generic:

```json
{
  "input": {
    "query": "optional app-owned payload"
  },
  "scope": {
    "workerId": "optional",
    "workspaceId": "optional",
    "sessionId": "optional"
  }
}
```

The response is generic:

```json
{
  "action": {
    "id": "create-people-profile",
    "protocolAction": "peopleProfiles.create"
  },
  "result": {
    "ok": true,
    "message": "People profile draft created.",
    "refresh": true,
    "redirectTo": "/hr/people"
  }
}
```

`message`, `refresh`, and `redirectTo` are protocol-level UI hints. Their meaning
is limited to shell behavior. Host must not infer a created HR profile or QA
release object from them.

### Search Providers

Host should expose:

```text
GET /api/local/apps/:appId/search?providerId=<provider>&query=<query>&limit=<n>
```

`providerId` must match `manifest.ui.shell.search.protocolProvider`.

The response is a generic list of app-owned result summaries:

```json
{
  "providerId": "peopleProfiles.search",
  "items": [
    {
      "appId": "aiworker-hr",
      "authority": "soul-app",
      "id": "profile-draft",
      "kind": "people-profile",
      "title": "People profile draft",
      "summary": "Open HR profile workspace",
      "openAction": {
        "id": "open-profile",
        "input": {
          "profileId": "profile-draft"
        }
      }
    }
  ]
}
```

Host may display titles and summaries. Host must not map fields into HR/QA
domain schemas or filter by app-internal fields.

### App Settings

App-specific settings should be an action, not a Host settings schema.

`manifest.ui.shell.settings` already declares:

```json
{
  "id": "hr-settings",
  "label": "HR settings",
  "protocolAction": "settings.open"
}
```

Worker Web should render the app settings intent as a shell action. The first
implementation may return a message and optional `redirectTo`; it does not need
to create a complex app settings editor. Global appearance, language, default
engine, local MCP and connector settings remain Host-owned.

## Host Responsibilities

Host owns:

- app lifecycle and enabled/disabled checks;
- manifest declaration lookup;
- permission decision for declared UI actions and search providers;
- mounted service launch and signed mount context;
- generic result envelope;
- platform audit for the protocol call;
- non-authoritative cache metadata when returning descriptor/search views.

Host does not own:

- the domain command implementation;
- HR people profile creation;
- QA release gate creation;
- app search semantics;
- app settings schema;
- app-local persistence.

## Soul App Responsibilities

Soul App owns:

- mapping `protocolAction` to app-local behavior;
- validating app-owned input payloads;
- deciding what `message`, `redirectTo`, `refresh`, and search summaries mean;
- preserving standalone behavior with the same domain logic;
- refusing actions that are invalid for its domain state.

Reference apps should implement minimal mounted handlers:

| App | Action/search | Minimal behavior |
| --- | --- | --- |
| HR | `peopleProfiles.create` | Return ok, message, refresh, and `/hr/people` redirect hint |
| HR | `people.refresh` | Return ok and refresh hint |
| HR | `drawers.evidence.toggle` | Return ok and message; Web can ignore unsupported drawer hints |
| HR | `settings.open` | Return ok and message or app settings redirect hint |
| HR | `peopleProfiles.search` | Return app-owned people profile summaries |
| QA | `releaseGates.create` | Return ok, message, refresh, and `/qa/release` redirect hint |
| QA | `release.refresh` | Return ok and refresh hint |
| QA | `settings.open` | Return ok and message or app settings redirect hint |
| QA | `releases.search` | Return app-owned release summaries |

These reference behaviors prove the protocol path. They are not final HR/QA
business persistence.

## Worker Web Behavior

Worker Web should:

- render shell primary/actions/settings from `mountedContribution.shell` or
  manifest fallback;
- enable actions only when Host exposes the generic invocation endpoint;
- call the generic Host action endpoint with current worker/workspace/session
  scope;
- show a compact pending/success/error state without app-specific wording;
- call `refresh()` when the result says `refresh: true`;
- navigate only to protocol-provided `redirectTo` values that are local app
  routes or Host-safe routes;
- call generic search endpoint when a shell search provider exists;
- display app-owned search result titles/summaries in the shell search area;
- never branch on `aiworker-hr`, `aiworker-qa`, `peopleProfiles`, or `releaseGates`
  to implement behavior.

## Error Handling

Host API errors should use stable app interaction codes:

- `SOUL_APP_NOT_FOUND`
- `SOUL_APP_DISABLED`
- `SOUL_APP_ACTION_NOT_DECLARED`
- `SOUL_APP_SEARCH_NOT_DECLARED`
- `SOUL_APP_PERMISSION_DENIED`
- `SOUL_APP_SERVICE_NOT_CONFIGURED`
- `SOUL_APP_SERVICE_UNREACHABLE`
- `SOUL_APP_PROTOCOL_ERROR`

Worker Web should display generic failure copy such as “Action unavailable” or
“Search unavailable” and avoid exposing raw stack traces.

## Security And Isolation

The endpoint must not become a generic proxy for arbitrary app URLs. Host must
look up the declared action/search descriptor before invoking the mounted app.

The mounted app receives the same signed mount context used by existing mounted
surfaces, including app id, broker URL, route prefix, permissions, worker,
workspace, session and operator scope when present.

Actions and search may use Host broker URLs, but app code must not import Host
private DB/runtime modules.

## Verification

The implementation is acceptable when:

- shared protocol types cover action result refresh hints and search results;
- Host API tests prove declared action/search invocation succeeds;
- Host API tests prove undeclared action/search ids are rejected;
- Host API tests prove disabled apps cannot be invoked;
- HR/QA tests prove mounted services implement action and search handlers;
- HR/QA validate and smoke still pass;
- Worker Web tests prove shell action buttons are enabled, call generic endpoint,
  refresh on success, and do not use app-specific behavior;
- Worker Web tests prove shell search calls generic search and renders app-owned
  result summaries;
- root `typecheck`, `lint`, `test`, `build`, `git diff --check`, browser smoke
  and code-review-graph pass.

## Acceptance Criteria

- The operator can click HR and QA shell primary actions from Worker Web.
- The operator can search through app-declared shell search providers.
- App settings intent is exposed through app-declared protocol action.
- Host rejects undeclared action/search invocations.
- Host does not define or persist HR/QA domain objects as a side effect.
- HR/QA standalone and Host mounted validation remain green.
- PMA records and changelog describe the completed protocol interaction closure.
