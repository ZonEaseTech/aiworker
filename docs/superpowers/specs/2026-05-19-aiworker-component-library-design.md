# AIWorker Host/Soul Shared Component Library Design

## Decision

AIWorker should upgrade `packages/component` into a real Host/Soul shared
component library.

The package should be a first-class UI dependency for Host Web and Soul App Web
surfaces. It should own React components, a style entrypoint, design tokens,
headless interaction wrappers, catalog documentation, examples, and quality
gates. New Host Web or Soul App UI should start from this package instead of
hand-written app-local CSS.

This is a product and agent workflow decision, not only a refactor. AIWorker is
agent-driven, and future agents need active constraints in `AGENTS.md` and the
component package itself. Chat memory is not enough to prevent the next Web
slice from drifting back into one-off styles.

## Current Findings

`packages/component` exists but is still closer to a Worker Web extraction than
a complete component library.

- It exposes primitives, layout, patterns, and studio compatibility exports.
- Its React components still depend on CSS classes mostly defined in
  `apps/web/src/styles/*`.
- It does not export a package-owned `styles.css`.
- It does not provide a complete component catalog, implemented/planned status,
  or migration queue.
- Existing Web hotspots still contain many reusable UI structures:
  `worker-studio.tsx`, `settings-dialog.tsx`, `session-chat.tsx`,
  `session-detail.tsx`, and the HR people workbench.
- Official Soul App `product/web` files currently act mostly as descriptor
  stubs, so the first implementation must add a small real Soul App Web
  consumption proof.

A CRG pass was started during design. It reported that the current graph was
built on an older branch and must be rebuilt before implementation. Even as a
stale discovery pass, it identified the expected large Web files and component
package files. Implementation must rebuild/update CRG before using it as
evidence.

## Goals

- Make `packages/component` a self-contained shared component package for Host
  and Soul App Web UI.
- Export package-owned styles and tokens through a stable entrypoint such as
  `@zonease/aiworker-component/styles.css`.
- Define a complete AIWorker component taxonomy so future agents know where new
  UI belongs.
- Use mature headless primitives for complex interactive components instead of
  hand-written focus trap, keyboard navigation, scroll lock, or portal logic.
- Aggressively lift reusable UI from existing Host Web and HR workbench surfaces
  into the component package.
- Prove both Host Web and an official Soul App Web surface consume the package.
- Add `AGENTS.md` constraints so new UI must use the shared component library
  first.
- Keep Host/Soul architecture boundaries intact: shared UI must not own domain
  meaning.
- Preserve visual stability. Host/Soul Web must not suffer style collapse while
  styles move into the package.

## Non-Goals

- Do not make `packages/component` interpret HR, QA, artifact, profile, review,
  lesson, worker, workspace, or session semantics.
- Do not fetch Host or Soul App data from shared components.
- Do not replace the Host/Soul protocol or manifest boundary.
- Do not rewrite all Web screens in one blind sweep without CRG/source
  candidate evidence.
- Do not keep compatibility shims that preserve stale app-local styling as the
  default path.
- Do not create a shadcn-style copy registry for this project. The chosen model
  is a shared package that Host and Soul Apps import directly.

## Architecture

`packages/component` becomes the shared UI package.

It owns:

- React components and public TypeScript props.
- CSS variables, theme tokens, motion tokens, focus styles, typography, radius,
  density, and component classes.
- A style entrypoint for consumers.
- Headless primitive wrappers for complex interactive components.
- Catalog metadata that marks each component as implemented, planned,
  experimental, or deprecated.
- Example/demo surfaces used for visual checks.
- Package tests and build/type gates.

Host Web and Soul App Web surfaces own:

- Data loading.
- Domain state.
- Domain labels and copy.
- Permission results.
- Workflow decisions.
- App-specific composition of generic shells.
- Domain-specific artifact/profile/review meaning.

The responsibility flow is:

```text
Host or Soul consumer
  -> passes explicit props, labels, slots, state and callbacks
  -> shared component renders layout, style, accessibility and interaction
  -> consumer handles domain action outcomes
```

No shared component may fetch Host/Soul data or infer hidden domain behavior.

## Component Taxonomy

The component map should be AIWorker-specific rather than a blind clone of
shadcn/ui.

### Foundation

- `styles.css`
- token variables
- light/dark theme variables
- typography
- motion
- focus rings
- density and radius
- icon conventions

### Primitives

- Button and IconButton
- Badge and status marker
- Card and action card
- Field, label, help text, validation text
- Input, Textarea, Select trigger foundations
- Checkbox, Radio, Switch
- Separator
- Skeleton and loading block

### Headless Interaction Wrappers

- Dialog
- Select
- Dropdown menu
- Popover
- Tooltip
- Tabs
- Command palette
- Toast
- Scroll area

Only implemented wrappers should add dependencies. The long-term direction is
full support, but the first implementation should introduce mature headless
dependencies only where components are actually delivered.

### Navigation And Data Display

- Nav item
- Toolbar and toolbar button
- Segmented control
- Grouped list
- List item
- Activity row
- Status pill
- Metadata grid
- Key-value row
- Timeline/event row
- Empty, loading, and error states

### Layout

- App shell primitives
- Host header row primitives
- Sidebar/rail
- Main panel
- Detail drawer
- Split layout
- Page/workspace header
- Section header

### Workbench Patterns

- Session composer shell
- Chat/message flow shell
- Message row
- Tool call/result card
- Progress card
- Action rail
- Search result list
- Settings shell

### Soul Domain Shells

These are generic shells only. They should help Soul Apps render domain objects
without teaching the shared package domain meaning.

- Artifact preview frame
- Profile reader shell
- Review panel shell
- Patch/revision review shell
- Evidence/source list shell

## First Migration Wave

The first implementation should combine the complete taxonomy with aggressive
uplift from existing Web code.

### Library Contract

- Move shared component CSS and tokens into `packages/component`.
- Export the component style entrypoint.
- Make `apps/web` import the package style entrypoint.
- Add catalog documentation inside the package or docs that lists implemented
  and planned components.
- Add package tests for the public component API and important accessibility
  behavior.

### Host Web Uplift

Use CRG plus source scans to identify reusable pieces from:

- `apps/web/src/features/settings/components/settings-dialog.tsx`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/session-detail.tsx`
- `apps/web/src/worker/session-progress-panel.tsx`

Likely components include settings shell, settings navigation item, segmented
control, action button, host locator/header primitives, shell toolbar, grouped
list, chat composer, message flow, tool result card, progress card, artifact
preview frame, review panel shell, and memory/lesson list shell.

### Soul App Uplift

Use the HR people workbench as the first real Soul App proof:

- Lift generic profile list/reader/action-rail shells where possible.
- Keep HR lifecycle, candidate/person semantics, copy, profile parsing and
  review decisions inside HR-owned code.
- Add or update an official Soul App `product/web` surface so it imports
  `@zonease/aiworker-component` and its styles directly.

## AGENTS.md Constraints

Implementation should update `AGENTS.md` with a Web component rule:

- New Host Web or Soul App UI must first look for a matching component or
  pattern in `packages/component`.
- New app-local UI components or CSS require an explicit reason:
  the component package lacks the needed primitive/pattern, the UI is truly
  domain-specific, or the code is a temporary migration step.
- If the gap is reusable, implementation must either add it to
  `packages/component` or register it in the component catalog migration queue.
- New complex interaction components must use mature headless primitives.
- App-local CSS must not redefine package tokens or fork shared primitives.
- Historical UI is migrated through planned slices, but newly touched UI should
  converge toward the shared package.
- Code review must check this constraint before closing Web work.

## Error And State Handling

Shared components should expose explicit state props for:

- loading
- empty
- error
- disabled
- selected/active
- busy/submitting
- validation status

Shared components render stable, accessibility-safe shells. Consumers provide
domain messages, recovery actions, and side effects. Empty/error/loading states
must have stable dimensions where layout collapse would damage the workbench.

Dialog, menu, select, popover, tooltip, tabs, command and toast behavior should
come from mature headless primitives so keyboard and focus behavior are not
hand-rolled.

## Styling Model

The package should own the shared visual language:

- CSS variables as the public styling contract.
- Tailwind v4-compatible theme variables when useful.
- No new arbitrary hex values in app-local CSS.
- No app-local copies of primitive styles.
- Stable class names for build-time CSS guard checks.
- Explicit light/dark theme behavior.
- Motion tokens with reduced-motion support.

Existing `apps/web/src/styles/*` files should be split carefully. Shared
component styles move into the package. App-specific layout and domain styles
stay local until a planned migration promotes them.

## Testing And Verification

The implementation is not complete until it proves that Host/Soul Web did not
visually collapse.

Required verification:

- Rebuild/update CRG before implementation candidate selection.
- Run CRG review before completion.
- Produce a reusable UI candidate list from CRG plus source scans.
- `bun run --filter '@zonease/aiworker-component' typecheck`
- Focused component tests for new primitives and interaction wrappers.
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Keep or update the Web CSS selector guard so critical shell selectors remain
  present after style extraction.
- Compile or smoke an official Soul App Web surface that imports the shared
  component package.
- Browser visual smoke for Host Web.
- Browser visual smoke for the official Soul App proof surface.
- `git diff --check`

If a full root gate is too expensive during an intermediate step, the final
closeout must still run the focused gates that cover the touched package and
Web surfaces, and explain any skipped global gate.

## Implementation Notes

The implementation plan should be staged to avoid style collapse:

1. Rebuild CRG and produce the reusable UI candidate list.
2. Add package style entrypoint and import it from Host Web without removing
   existing app CSS yet.
3. Move foundation tokens and the safest primitive styles first.
4. Add catalog documentation and AGENTS constraints.
5. Introduce headless wrappers for delivered interactive components.
6. Migrate Host Web hotspots in small verifiable batches.
7. Add a real official Soul App Web consumption proof.
8. Remove superseded app-local CSS only after build and browser checks pass.
9. Run final CRG and focused quality gates.

The implementation may be broad, but every migrated component must preserve the
architecture rule: shared UI renders structure and interaction; Host and Soul
Apps own meaning.
