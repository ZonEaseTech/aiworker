# Worker Workbench Overlay Design

## Summary

AIWorker should keep moving toward a light Local Shell + Engine Bridge for Soul
Apps. The next product slice should make each Soul worker feel like a
Codex-style scoped work surface: a left-side workspace/session tree, a clean
session thread plus composer, and a worker-level configuration dialog for
runtime overlays.

This design deliberately keeps Host thin. Host owns navigation, local worker
metadata, overlay persistence, session creation, and engine-asset projection.
Soul Apps continue to own domain semantics, app-owned outputs, and specialized
workbenches. Generic composer and chat behavior should become shared UI
infrastructure instead of being reimplemented in one Worker Web screen.

## Goals

- Let users click a Soul worker and immediately see that worker's workspaces and
  sessions in one clean page.
- Keep workspace as the business boundary for sessions without forcing a
  separate workspace page as a required middle layer.
- Let users customize a worker at runtime through worker-owned overlays for
  native skills, MCP clients, and entry files.
- Keep new sessions fast: users type the work, attach source material, and let
  native skills auto-intervene by default.
- Support explicit skill use through `$` inside the composer, following Codex's
  composer-attached typeahead pattern.
- Harden the composer, chat, artifact-card, and attachment primitives as shared
  UI components.

## Non-Goals

- Do not turn Host into a generic agent runtime, dashboard, governance surface,
  proposal system, or domain-data interpreter.
- Do not write runtime worker customization back into the Soul App template
  source.
- Do not make users select a skill as a required step before starting a session.
- Do not put the entire generic worker workbench into `packages/soul-app-sdk`.
- Do not make worker configuration a Host Settings page.

## Product Model

The product path remains:

```text
AIWorker -> Soul App -> Soul worker -> workspace -> session -> app-owned work
```

Clicking a Soul worker from Host opens a single worker-scoped workbench page:

```text
Soul worker workbench
  left panel: workspace/session tree
  main panel: current session thread + composer
  worker row menu: Worker configuration dialog
```

The left panel shows the selected worker, its workspaces, and the sessions under
each workspace. Workspace remains the session boundary, but it is represented as
a group in the worker page rather than as a separate required page.

The main panel should not have a heavy first toolbar row. It shows the current
session thread and the composer. When no session is selected, it shows the
appropriate empty state.

## Empty Worker State

A newly created worker may have no workspaces. It should still open the same
worker workbench page:

- The left panel shows the worker row and a new-workspace affordance.
- The main panel asks the user to create the first workspace.
- The session composer is not active until a workspace exists, because every
  session must belong to a workspace.
- Worker configuration remains available from the worker row menu.

## Workspace And Session Actions

Actions should follow Codex-like row actions:

- Worker row `...`: opens Worker configuration.
- Workspace row compose action: starts a new session inside that workspace.
- Workspace row `...`: owns workspace-level secondary actions.
- Session row: selects an existing session.

New session should not live on the worker row by default. If it did, workspace
assignment would become implicit and the product hierarchy would become blurry.

## Worker Overlay Model

Runtime customization belongs to the worker instance overlay:

```text
effective assets = Soul App baseline + worker overlay
```

Soul App baseline includes app-authored engine assets such as:

- `engine-assets/skills/**/SKILL.md`
- `engine-assets/mcp-clients/**`
- `engine-assets/workspace/AGENTS.md`
- `engine-assets/workspace/CLAUDE.md`
- other app-authored entry files

Worker overlay owns runtime changes:

- skills: create, edit, enable, disable, duplicate, hide baseline, remove
  overlay, reset to baseline
- MCP clients: create, edit, enable, disable, duplicate, hide baseline, remove
  overlay, reset to baseline
- entry files: edit, enable, disable, compare baseline, reset overlay
- projection: inspect receipts and manually re-project existing workspaces

Overlay changes apply by default to new workspaces and new sessions under the
worker. Existing workspaces are not changed automatically. Re-projecting an
existing workspace is an explicit advanced action in the Projection section.

## Worker Configuration Dialog

Worker configuration opens from the worker row `...` action. It must be named
Worker configuration to avoid confusion with Host Settings.

The dialog structure:

```text
Header: worker name and close/save state
Category tabs: Skills / MCP clients / Entry files / Projection
Horizontal asset list: current category assets
Selected asset object editor: content, status, validation, actions
```

The asset list should be horizontal and scrollable. A vertical worker normally
has a small number of skills and MCP entries; a vertical management table would
make the product feel like an admin console.

The selected asset is edited as one integrated object:

- Editor and Preview are toggle states in the content area.
- Enable/disable is a switch on the selected asset.
- Compare baseline is visible when useful for overlay editing.
- Save/revert belongs to the selected object or dialog dirty state.
- The `More` menu is narrow and only contains secondary or destructive actions.

Recommended `More` menu:

- Overlay asset: duplicate, rename, open projected location, view projection
  receipt, remove overlay and use baseline.
- Baseline asset: duplicate into overlay, open projected location, view
  projection receipt, hide for this worker.

Edits, switches, and remove/hide actions should enter a pending-changes state.
They should not mutate the effective worker configuration until the user saves.

## New Session Flow

Starting a session:

```text
workspace row compose
  -> main panel shows new session composer
  -> user types goal and attaches source material
  -> optional `$skill` mention
  -> start session
  -> same panel becomes session thread
  -> app-owned artifacts appear inline as cards/descriptors
```

Skill selection is not a required step. Native skills should auto-intervene
based on the instruction, source material, worker overlay, and Soul App
baseline. Explicit skill use is available only when the user types `$` in the
textarea.

There should be no external `$ skill` toolbar button. The composer toolbar
should remain generic: attachment/source material and send/start.

## Composer Experience

The composer should feel closer to Codex Desktop than to a form:

- One focused input container.
- Textarea grows naturally.
- Attachments and source materials appear as chips only when present.
- Explicit `$skill` mentions appear inline or as chips after selection.
- Status text is minimal and should mostly appear only when something needs
  attention.
- Start/send state stays inside the composer container.

The `$` suggestions should follow Codex's composer-attached typeahead pattern:

- Triggered by typing `$` inside the textarea.
- Rendered as a panel attached to the composer container.
- Opens upward above the composer when the composer is near the bottom of the
  viewport.
- Not a toolbar popover.
- Not a detached page-level dropdown.
- Not required to anchor to the exact character cursor like an IDE completion
  popup.

## Shared Component Boundary

The generic composer/chat behavior should not be implemented as a
worker-workbench-local one-off. Shared visual and interaction primitives belong
in `packages/ui`:

- `SessionComposer`
- composer-attached upward typeahead
- attachment/source chips
- `SessionThread`
- `SessionMessage`
- `ArtifactCard`

`apps/web` owns the concrete worker workbench container:

- Host API binding
- worker/workspace/session routing
- worker overlay persistence calls
- conversion between Host records and shared UI component props

`packages/soul-app-sdk` should remain the Soul App authoring and protocol helper
layer. It may expose types or helpers for manifest/workbench descriptors, but it
should not own React worker workbench UI or Host overlay persistence.

If Host Web and standalone Soul Apps later need to share non-visual workbench
behavior, add a small headless package such as `packages/workbench` or
`packages/soul-workbench`. That package may own view models for the
workspace/session tree, composer drafts, mention resolution, and generic asset
editor state. It must not fetch Host APIs or encode domain semantics.

## Data Flow

New session:

```text
workspace compose action
  -> apps/web opens a new-session state for the workspace
  -> SessionComposer collects input, source materials, and optional `$mentions`
  -> Host creates a session under the workspace
  -> engine bridge receives effective assets from baseline + overlay
  -> thread updates stream into the main panel
  -> app-owned artifact descriptors/cards appear in the thread
```

Worker overlay:

```text
worker row menu
  -> Worker configuration dialog
  -> edit pending overlay changes
  -> validate selected asset and whole overlay
  -> save worker overlay
  -> new workspaces and sessions use updated effective assets
  -> existing workspaces change only through explicit Projection action
```

## Error And Edge States

- No workspace: show create-first-workspace empty state; do not show active
  session composer.
- Invalid or disabled asset: exclude it from `$` suggestions and show the issue
  in Worker configuration.
- `$unknown`: show no matches; allow the user to keep typing and submit natural
  language.
- MCP secret risk: block literal secrets and require environment wiring, vault,
  or secret references.
- Overlay save conflict: keep pending changes visible and let the user retry or
  reload. Do not silently overwrite.
- Existing workspace drift: never auto re-project; require explicit Projection
  action.
- Detached Soul App surface: Host stops when a required app-owned surface is not
  declared. It does not infer domain behavior.

## Component Library Preflight

This design should reuse and harden the current shared UI direction:

- Use `packages/ui` as the default target for composer, chat, item, button, and
  artifact-card primitives.
- Use the active shadcn-managed theme and icon convention from `packages/ui`.
- Do not add reusable primitives to `packages/component`; it remains legacy
  migration debt.
- Avoid app-local composer/chat CSS unless there is a documented temporary gap.
- When implementation touches visible UI, run `bun run ui:check` and visual
  verification.

## Testing And Verification Plan

Focused tests should cover:

- Worker workbench tree renders workspaces and sessions under the selected
  worker.
- No-workspace worker state prompts for first workspace and disables new
  session composer.
- Workspace row compose opens new-session composer in the main panel.
- Session start transitions the same panel into the session thread.
- Composer supports attachments, submit state, disabled state, and `$`
  typeahead.
- `$` typeahead is composer-attached and opens upward when near the bottom.
- Worker configuration dialog supports category tabs, horizontal asset list,
  editor/preview toggle, enable switch, pending changes, save/revert, and
  narrow `More` menu.
- Overlay resolution produces effective assets from Soul App baseline plus
  worker overlay.
- Existing workspace re-project is explicit and never automatic.

Recommended verification when implemented:

- Focused `@zonease/aiworker-web` tests for workbench and composer behavior.
- Focused `@zonease/aiworker-ui` tests for shared composer/chat primitives.
- Focused core/storage tests for worker overlay persistence and effective asset
  resolution.
- `bun run ui:check` for visible UI component governance.
- Playwright/browser visual checks for first screen, Worker configuration, and
  composer typeahead.
- `bun run crg:update` and `bun run crg:review` after production code changes.

## Implementation Defaults

- Do not add a headless workbench package in the first implementation slice.
  Start by hardening `packages/ui` and keeping Host API binding in `apps/web`.
  Add `packages/workbench` or `packages/soul-workbench` only after a second
  consumer needs shared non-visual state models.
- Store worker overlay as Host metadata and references, not domain facts. The
  exact schema and migration belong in the implementation plan, but the storage
  contract must preserve baseline-vs-overlay provenance and pending-save
  semantics.
- Resolve `$skill` mentions before engine invocation. The session turn may keep
  mention metadata for display/debugging, but the engine bridge receives an
  effective invocation context derived from baseline plus worker overlay.
- App-owned custom workbenches can reuse shared `packages/ui` composer/chat
  primitives when useful, but Host must not require a custom Soul App workbench
  to adopt them. The basic worker workbench remains Host-owned shell behavior.
