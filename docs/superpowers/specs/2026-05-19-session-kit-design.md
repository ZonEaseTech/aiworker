# AIWorker Session Kit Shared Component Design

## Decision

AIWorker should extract the reusable Web session experience into a shared
`Session Kit` inside `packages/component`.

The extraction should use the UI + view-model boundary: shared code owns generic
session UI structure, action-bar behavior, normalized event view models and
attachment helpers; Host Web and Soul Apps own data loading, protocol calls,
workspace/session routing and domain meaning.

This means Soul Apps consume the same session composer and session surfaces
instead of maintaining app-local variants. The HR People Workbench right-panel
composer should be migrated onto the shared composer/action bar, while HR keeps
profile semantics, recent-session context and profile promotion policy.

## Current Findings

The repository already has a shared component package and the first extraction
wave is partially complete:

- `packages/component` exposes shared patterns such as `ProgressCard`,
  `MessageFlow`, `MessageRow`, `ToolResultCard`, `ArtifactPreviewFrame`,
  `ReviewPanelShell`, `ProfileReaderShell`, `StudioSectionHeader` and
  `StudioActivityRow`.
- `apps/web/src/worker/session-progress-panel.tsx` is already a thin adapter
  over `ProgressCard`.
- `apps/web/src/worker/session-chat.tsx` still owns event normalization,
  timeline grouping, scroll pinning, tool-card composition and the compact
  follow-up composer.
- `apps/web/src/worker/session-detail.tsx` still owns the artifact/review/
  lesson/event detail composition and a separate turn composer.
- `apps/web/src/features/local-workspace/components/session-composer.tsx` owns a
  large workspace composer with a simpler action bar.
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
  owns a richer profile-draft composer with file attachments, a compact
  template selector and icon-only submit action.
- HR composer behavior proved useful beyond HR, but its labels, selected profile
  context and profile-update proposal semantics are HR-owned.

The gap is therefore not a missing button primitive. The missing layer is a
generic session-composition kit that several Host/Soul surfaces can consume
without copying composer, action bar, attachment, timeline and detail-panel
structure.

## Goals

- Add a public Session Kit layer to `packages/component`.
- Make `SessionComposer` and `SessionComposerActionBar` the canonical composer
  UI for workspace session creation, session follow-up and HR profile-draft
  creation.
- Extract attachment display, file-kind/size formatting and attachment
  conversion helpers into shared, domain-neutral helpers.
- Extract session event normalization into shared view-model helpers without
  importing Host API clients or HR app code.
- Extract timeline rendering into a shared `SessionTimeline` with pluggable
  render hooks for app-specific blocks.
- Extract session detail section shells into a shared `SessionDetailPanel` while
  keeping artifact/review/lesson meaning in the consumer.
- Keep Host/Soul architecture intact: shared components do not fetch, route,
  promote profiles, interpret review verdicts or infer Soul domain state.
- Reduce app-local CSS for session composer/action bar variants and move shared
  style rules into `packages/component`.
- Prove consumption in both generic Host Web session surfaces and the HR People
  Workbench right panel.

## Non-Goals

- Do not create a full `SessionWorkbench` container that owns Host API calls or
  stream lifecycle.
- Do not make shared components understand HR profile, candidate material,
  profile revision, review promotion or README acceptance semantics.
- Do not change the Host/Soul protocol or manifest schema for this work.
- Do not rewrite every Worker Web panel in one step if a narrower migration can
  prove the shared boundary.
- Do not keep duplicated app-local composer/action-bar CSS after a shared
  component covers the same behavior.

## Architecture

The shared package gets a `session-kit` surface:

```text
packages/component
  -> session kit UI components
  -> session kit view-model helpers
  -> package-owned styles

Host Web / Soul App consumers
  -> fetch and stream data
  -> build domain labels and options
  -> pass controlled props/callbacks
  -> render app-owned artifact/profile/review/lesson content
```

The shared Session Kit should be controlled and dependency-light. Consumers pass
state, callbacks, options, labels and slots. Session Kit returns no hidden side
effects beyond browser-local file reading when the consumer opts into attachment
helpers.

### Public Components

`SessionComposer`

- Renders the complete composer: optional heading, textarea, warnings,
  attachment list, action bar and submit control.
- Supports variants for large workspace creation, compact follow-up and panel
  embedded use.
- Receives controlled `value`, `onValueChange`, `onSubmit`, `submitting`,
  `disabled`, `disabledReason`, `placeholder`, `ariaLabel`, `title` and
  `description`.
- Receives optional `attachments`, `onAddAttachments`, `onRemoveAttachment` and
  attachment labels.
- Receives optional `templateOptions`, `selectedTemplateId` and
  `onTemplateChange`.
- Receives optional engine/status action props, secondary actions and custom
  footer/status slots.

`SessionComposerActionBar`

- Renders the bottom action row used by `SessionComposer`.
- Provides attachment trigger, compact template selector, engine/status action,
  secondary icon actions and icon submit.
- Can be used independently when a consumer needs custom composer layout but the
  same action bar.
- Encodes responsive and disabled states once in the shared package.

`SessionTimeline`

- Renders user turns, assistant turns, status events, tool-use/result cards,
  artifact/review/lesson chips, errors and waiting states from a normalized view
  model.
- Owns generic timeline layout, message rows and overflow behavior.
- Accepts render overrides for app-specific event blocks while keeping the
  default behavior useful for Host Web.

`SessionDetailPanel`

- Renders generic sections for summary, progress, composer slot, artifact,
  review, memory/lesson and event stream.
- Does not format review verdict meaning or lesson policy itself.
- Lets consumers pass section content and actions while sharing panel layout,
  spacing, empty/error/loading states and responsive behavior.

### Public Helpers

`normalizeSessionEvents`

- Converts raw session events into a generic event view model with kinds such as
  `text`, `thinking`, `tool_use`, `tool_result`, `status`, `usage`, `artifact`,
  `review`, `lesson`, `log`, `raw` and `error`.
- Does not require Host API imports. The helper should accept plain records or a
  small structural input type.

`createSessionTimelineViewModel`

- Groups turns with their normalized events.
- Applies text/log compaction and fallback response handling.
- Leaves timestamps and labels as caller-provided formatted strings or formatter
  callbacks so i18n remains in the consumer.

`createComposerAttachment`

- Reads browser `File` objects into neutral material descriptors with name, size,
  MIME type, encoding and content.
- Provides file kind and file size formatting helpers.
- Does not decide where files are persisted or how they are referenced in
  session metadata.

## Data Flow

Generic workspace composer:

```text
WorkerStudio state
  -> selected workspace/template/engine readiness
  -> SessionComposer large variant
  -> onSubmitSession callback
  -> WorkerStudio persists optional materials and starts session stream
```

Session follow-up:

```text
WorkerStudio selected session
  -> SessionTimeline for existing turns/events
  -> SessionComposer compact variant for follow-up
  -> onSubmitTurn callback
  -> WorkerStudio continues session stream
```

HR right panel:

```text
HrPeopleWorkbench focused profile
  -> HR builds title, description, template labels and recent sessions
  -> SessionComposer panel variant
  -> shared attachment helper produces neutral materials
  -> HR/WorkerStudio submit callback persists evidence and starts profile-bound session
```

The shared layer never promotes accepted profile state. Profile review and
promotion remain in the HR center-column review flow.

## Error And Disabled States

- Engine not ready: consumer passes a disabled reason; `SessionComposer` renders
  the warning consistently.
- No workspace/profile selected: consumer passes a disabled reason and may hide
  submit, but shared UI handles the visual state.
- Attachment read failure: shared helper surfaces a thrown error; consumer maps
  it to localized copy. `SessionComposer` renders the error slot.
- Empty input: submit is disabled unless `allowSubmitWithoutText` is true or
  attachments exist.
- Stream failure: stays outside Session Kit. Consumers continue to own the async
  session lifecycle and refresh behavior.
- Event payload drift: `normalizeSessionEvents` falls back to status/raw/error
  blocks instead of throwing for unknown event shapes.

## Component Library Preflight

Already available shared pieces:

- `Button`, `IconButton`, `Select`, `Textarea`
- `ProgressCard`
- `MessageFlow`, `MessageRow`, `StatusEventPill`, `ToolResultCard`
- `ArtifactPreviewFrame`, `ReviewPanelShell`, `ProfileReaderShell`
- `StudioSectionHeader`, `StudioActivityRow`, `StudioEmptyState`,
  `StudioPill`, `StudioStatusPill`
- `WorkerStudioLayout`

Reusable gaps to close:

- canonical session composer shell
- canonical session composer action bar
- composer attachment list and attachment helpers
- normalized session event view model helpers
- timeline renderer over normalized session events
- generic session detail panel sections

These gaps should be added to the component catalog and removed from the
migration queue once implemented.

## Migration Plan

1. Add shared Session Kit types, helpers, components, styles and tests in
   `packages/component`.
2. Migrate the generic large workspace composer from
   `WorkspaceSessionComposer` to `SessionComposer`.
3. Migrate the session follow-up composer in `WorkerSessionChat` to the compact
   `SessionComposer` variant.
4. Migrate the right-side turn composer in `SessionDetail` to the shared
   composer or a compact detail-panel composer slot.
5. Migrate the HR profile tools panel composer to `SessionComposer` and remove
   the duplicated HR action bar, attachment list and select sizing CSS.
6. Extract timeline rendering from `WorkerSessionChat` into `SessionTimeline`
   and shared view-model helpers.
7. Extract detail-panel section layout from `SessionDetail` into
   `SessionDetailPanel` while preserving Host-owned data callbacks.
8. Update component catalog, PMA docs, changelog and UI governance evidence.

The first implementation should prioritize composer/action-bar migration before
timeline/detail migration because the HR right panel and generic workspace
composer currently diverge most visibly there.

## Testing And Verification

Focused tests:

- `packages/component` pattern tests for `SessionComposer`,
  `SessionComposerActionBar`, attachment helpers, event normalization and
  timeline rendering.
- WorkerStudio integration tests covering generic workspace composer creation,
  session follow-up, disabled engine state and HR profile composer material
  attachments.
- HR people workbench model/tests remain responsible for profile semantics.

Quality gates:

- `bun run --filter '@zonease/aiworker-component' test`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- focused Worker Web tests touching `worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- browser smoke for the generic session route and HR right panel composer
- `bun run crg:update`
- `bun run crg:review`

## Acceptance Criteria

- Generic workspace session creation and session follow-up use shared
  `SessionComposer`.
- HR right panel uses shared `SessionComposer` and
  `SessionComposerActionBar`.
- HR no longer maintains app-local action-bar/attachment/select sizing CSS for
  behavior covered by Session Kit.
- Session timeline rendering uses shared normalized view-model helpers.
- Session detail shell uses shared section/panel primitives where practical.
- Host Web and HR behavior remain covered by focused tests and browser smoke.
- Shared components do not import Host Web API clients, HR app modules or Soul
  App internals.
- Component catalog and migration queue accurately reflect the new shared
  Session Kit state.
