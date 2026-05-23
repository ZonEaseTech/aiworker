# Managed Session Composer Design

## Context

AIWorker is a local shell and engine bridge for Soul Apps. The product path is
AIWorker -> Soul App -> workspace -> session -> app-owned work. A session
composer should therefore feel like a thin local entrypoint into the native
engine experience, not like an AIWorker-owned workflow builder or Host-owned
configuration form.

The current implementation has a mature shared `SessionComposer` UI in
`packages/ui`, but consumers still duplicate the surrounding behavior:

- universal workbench new-session state still uses a hand-written input and
  button;
- session chat and session detail wire the shared composer separately;
- HR profile composer owns its own file input, preview URL lifecycle and
  attachment mapping.

This creates inconsistent interaction and makes the new-session composer feel
like a form even though it should be the same working surface as follow-up
session input.

## Goals

- Provide a managed session composer that any package or app can import quickly
  from `@zonease/aiworker-ui`.
- Keep the existing `SessionComposer` as the low-level visual component.
- Move reusable composer behavior into a package-level managed API: draft state,
  attachments, paste, previews, dedupe, material reads, template selection,
  mention output, submit clearing and error handling.
- Migrate the current universal workbench new session, session view/detail
  follow-up and HR profile composer consumers to the managed composer.
- Preserve the Host/Soul boundary and native engine ownership. The composer
  prepares local draft context only; it does not own engine workflows.

## Non-Goals

- Do not implement an AIWorker-owned agent runtime, workflow DSL, engine tool
  loop, approval UI, memory layer or event interpreter.
- Do not move workspace, session, HR profile or other domain semantics into
  `packages/ui`.
- Do not change Host micro-app mounting, Host chrome, timeline rendering,
  message flow rendering or engine event parsing except where a typed submit
  payload must carry existing draft materials.
- Do not force every legacy composer consumer to migrate in one sweep beyond
  the consumers named in this design.

## Package Boundary

`packages/ui` will continue to export the existing presentational composer:

```ts
import { SessionComposer } from '@zonease/aiworker-ui/components/session-composer'
```

It will also export a managed layer from the same public component module:

```ts
import {
  ManagedSessionComposer,
  useSessionComposerDraft,
} from '@zonease/aiworker-ui/components/session-composer'
```

`SessionComposer` remains responsible for the visual and interaction primitive:
textarea, action bar, attachment list, preview dialog, template selector, usage,
typeahead and variants.

`ManagedSessionComposer` and `useSessionComposerDraft` own only generic composer
state and browser-local behavior:

- controlled or local text state;
- hidden file input;
- file selection and paste handling;
- image preview URL creation and release;
- attachment deduplication;
- attachment item mapping;
- material encoding before submit;
- success cleanup and failure preservation;
- template and mention draft output;
- disabled, submitting and error display plumbing.

`packages/ui` must not import `@zonease/aiworker-shared`, Host Web packages,
Soul App packages or domain models. It receives labels and options as props and
emits a neutral draft.

## Draft Contract

The managed composer emits an app-neutral draft:

```ts
interface ManagedSessionComposerDraft {
  text: string
  files: File[]
  materials: SessionComposerMaterial[]
  selectedTemplateId?: string
  mentions: Array<{ id: string; kind: 'skill'; label: string }>
}
```

The component calls:

```ts
onSubmitDraft(draft, event)
```

Consumers translate the draft into their own request:

- new session: create a session using `draft.text`,
  `draft.selectedTemplateId`, `draft.materials` and `draft.mentions`;
- session follow-up: submit a turn using `draft.text` and `draft.materials`;
- HR profile composer: map `draft.text`, `draft.files`,
  `draft.materials` and `draft.selectedTemplateId` to HR-owned profile draft
  input.

The managed composer does not store or interpret domain attachment types. Apps
that need file name, MIME type, size or raw `File` values read them from the
neutral draft and build their own payload.

## Consumer Design

### Universal Workbench New Session

Replace the hand-written workspace empty-state input with
`ManagedSessionComposer` using a large variant. The selected workspace screen
becomes a start-work surface, not a form.

The sidebar `New Session` action should select the workspace and focus the
composer rather than attempting to create an empty session. Submission creates
the session, clears the draft on success and selects the created session.

### Session View And Detail

Session chat and session detail follow-up composer entrypoints should use the
same managed composer layer. Their submit adapter sends a turn to the selected
session.

These surfaces keep their session-specific information outside `packages/ui`:
running turn detection, usage calculation, timeline rendering, event stream and
session metadata stay in `packages/soul-app-workbench`.

### HR Profile Workbench

The HR profile composer should consume the managed composer for attachment and
draft interaction, while HR keeps ownership of profile gating, draft options,
domain copy and submit payload semantics.

For example, no selected profile can still disable the composer with an
HR-provided disabled reason. The selected HR draft option remains an HR concept
that is passed to the managed composer as generic template options.

## Engine Bridge Boundary

The managed composer is only a thin local context entrypoint. It collects user
text, files, template hints and skill mentions, then hands that draft to the
owning app or session bridge.

External engines still own their native experience: tool loop, model behavior,
sandbox, approvals, authentication profile, native session, plugins and memory.
The composer must not simulate engine approval behavior, interpret engine
events, persist engine memory or promote template and mention hints into
Host-owned orchestration.

The user experience should therefore feel close to a native engine input box
with local context helpers, not like a platform configuration wizard.

## Error Handling

Composer-local errors are handled inside the managed composer:

- material read failure;
- empty submit;
- duplicate file feedback when surfaced;
- preview or attachment lifecycle failure when recoverable.

Consumer submit errors are handled by preserving the draft and showing the
error in the shared composer error area. Consumers may also pass an external
error prop when they own the failure state.

Unavailable context is passed in by consumers through `disabled`,
`disabledReason`, `submitDisabled` and `submitting`. The managed composer shows
and respects these states without interpreting why the context is unavailable.

## Component Library Preflight

The implementation must reuse these `packages/ui` primitives:

- `SessionComposer`;
- `InputGroup` and `InputGroupTextarea` through the existing composer;
- `Button`, `Item`, `Badge`, `Alert`, `Dialog`, `Select` through the existing
  composer internals.

No new feature-local hex colors, arbitrary visual values or icon libraries
should be introduced. The existing shadcn/Hugeicons conventions remain the UI
source of truth.

## Testing

`packages/ui` tests should cover the managed composer:

- file add and paste;
- deduplication;
- image preview URL creation and release;
- material generation before submit;
- success cleanup;
- failure preservation;
- template selection;
- mention output;
- disabled, submitting and error display;
- continued compatibility for large, compact and panel variants.

Consumer tests should prove the adapters:

- universal workbench new-session submit carries text, template and materials
  and selects the created session;
- session follow-up submit uses the same managed draft behavior;
- HR profile composer preserves profile gating, draft option payload and
  domain-owned labels while using the managed attachment lifecycle.

Focused verification should include:

```bash
bun run --filter '@zonease/aiworker-ui' test
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-hr' test
bun run ui:check
bun run crg:update
bun run crg:review
```

Run narrower commands during development when useful, but close the
implementation with checks that cover both the shared package and real
consumers.

## Acceptance Criteria

- Any app can import a managed session composer from
  `@zonease/aiworker-ui/components/session-composer` and provide labels,
  options, state and an `onSubmitDraft` adapter.
- Universal workbench new session no longer renders a hand-written input and
  button.
- New session, session follow-up and HR profile composer share the same
  attachment, paste, preview, dedupe, material read, submit cleanup and error
  behavior.
- Domain semantics remain outside `packages/ui`.
- The native engine bridge remains thin: the composer prepares context but does
  not own tool loops, approvals, memory or orchestration.
- Focused shared UI, workbench and HR tests pass, UI governance passes, and
  code-review-graph is run for code changes.
