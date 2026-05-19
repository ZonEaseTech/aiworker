# Settings Configuration Boundary Design

## Goal

Make it impossible for Host platform settings and Soul App-owned configuration
to look or behave like the same surface.

## Decision

Use three distinct product layers:

1. **Host Platform Settings**: global/local platform preferences owned by Host,
   including execution mode, engines, BYOK, MCP, connector availability,
   language, appearance, installed Soul Apps and runtime details.
2. **Soul App Configuration**: app-owned domain configuration exposed through a
   manifest/protocol descriptor. Host can invoke or route it, but cannot render
   it as Host platform settings.
3. **Workspace / Session Preferences**: scoped choices that bind Host
   capabilities to a business workspace or session. Host owns capability
   enforcement; the Soul App owns domain meaning.

## Contract

The mounted workbench descriptor is renamed from `ui.workbench.settings` to
`ui.workbench.configuration`. Host Web may map it into a clickable action with
`role: "configure"`, but a successful app-owned configuration action must not
open the Host settings dialog.

The Host settings API remains `/api/local/settings` because that route is
already Host-owned and correctly scoped to platform preferences. The UI copy
should call this surface Platform Settings rather than generic settings.

## Behavior

- Fixed Host chrome settings controls open Platform Settings.
- Soul App configuration controls invoke the declared app protocol action.
- HR and QA official apps return app-owned configuration messages until they
  grow real domain configuration surfaces.
- Worker Web displays app action status for successful configuration actions.
- Manifest validation, security review and scaffold output use
  `configuration` wording.

## Testing

- Add a failing WorkerStudio regression that clicks HR app configuration and
  asserts the app protocol action is called while the Platform Settings dialog
  stays closed.
- Update shared manifest tests for `ui.workbench.configuration`.
- Update daemon/core/CLI/official app tests for the renamed descriptor.
- Run UI governance and code-review-graph because production UI and protocol
  files change.

## Out Of Scope

- Domain-specific HR/QA configuration forms.
- Renaming `/api/local/settings`.
- Historical audit documents that mention the old `settings` descriptor.
