# Session Activity Pipeline Design

## Decision

AIWorker should keep the shared Session Kit direction, but the next iteration is
not a visual-only tool-card cleanup. The session chat surface needs a parser-led
activity pipeline:

```text
raw engine event
  -> engine event parser / cleaner
  -> normalized session event
  -> activity view model
  -> SessionTimeline renderer
```

V1 supports Codex CLI events first because that is the current target for the
observed UX problem. The architecture remains engine-neutral so Claude Code and
future engines can add their own parsers later instead of pretending to emit the
same wire format as Codex.

## Context

The current shared `SessionTimeline` renders event kinds directly. Text is a
plain div, `tool_use` becomes a heavy bordered tool card, and Codex command
events often surface as `Bash Bash done` with raw command output too prominent.
This makes the chat feel like a raw engineering log rather than a readable
session narrative.

Codex Desktop uses a better information hierarchy: assistant prose is rich
markdown, tool activity is summarized as human-readable work such as reading,
searching, listing, editing or running, and raw evidence is available behind
details rather than being the primary visual object.

AIWorker should borrow that product idea, not Codex Desktop's private data
model.

## Goals

- Keep `SessionComposer` as the default shared composer surface.
- Add default file and image input capability to the shared composer path.
- Add image thumbnail preview and lightbox preview for attached images.
- Keep settings, model, MCP, skill, slash commands and permission controls out
  of the default composer.
- Add a Codex CLI activity parser that turns raw tool/status events into
  readable activity rows and grouped summaries.
- Preserve unknown events through a generic fallback with expandable raw detail.
- Render assistant text with markdown/GFM support.
- Make `SessionTimeline` feel like a chat/activity narrative instead of a list
  of raw tool cards.
- Keep Host/Soul boundaries intact: Host renders generic session activity; Soul
  Apps own domain labels and domain decisions.

## Non-Goals

- Do not implement Claude Code, Cursor, Gemini or OpenCode activity parsers in
  this pass.
- Do not change the Host/Soul protocol or storage schema.
- Do not let shared components infer HR profile, QA review or lesson semantics.
- Do not expose advanced engine controls in the default composer action bar.
- Do not remove raw command/output evidence; only demote it into collapsed
  details.
- Do not create a full Codex Desktop clone.

## Composer Scope

The default shared composer should provide a small vertical-product input
surface:

- textarea
- submit / busy state
- stop-capable action slot when the consumer has a stop operation
- `+` attachment trigger
- file attachment rows
- image attachment rows with thumbnail
- lightbox preview for image attachments
- optional template selector when the consumer provides domain choices

The action bar stays minimal. Settings and other advanced engine controls remain
outside the composer unless a specific consumer passes an explicit slot.

The existing HR right panel continues to map attached materials into
profile-draft session inputs. Generic workspace/session composers can opt into
the same attachment UI as they gain material persistence support.

## Activity Pipeline

### Parser Layer

`normalizeSessionEvents` should become parser-aware without binding UI to a
single engine format. V1 uses a Codex CLI activity classifier over the current
stored event shape:

```text
LocalSessionEvent.payloadJson.agentEvent
  -> Codex CLI activity classifier
  -> SessionActivityEvent
```

The classifier reads status, text, usage, file change, tool use and tool result
events. For Codex CLI command execution, it classifies shell commands into
activity types such as search, read, list, edit, create, delete, test, lint and
command. Unknown command shapes become generic command activity.

Every normalized event keeps enough raw detail for expandable evidence:

- original tool name
- command when present
- tool input
- tool output/result
- error flag
- raw payload fallback

### View Model Layer

`createSessionTimelineViewModel` should group related activity events into a
human-readable timeline. It should:

- compact consecutive assistant text deltas
- pair tool uses with tool results
- produce readable activity labels
- group low-value exploration events when they are adjacent
- keep failures visible
- keep artifact/review/lesson chips separate from generic engine activity

Examples:

```text
Searching component files
Searched 1 file and 2 queries
Reading session-timeline.tsx
Ran component tests
Edited profile-tools-panel.tsx
```

V1 labels may be English in shared components. Consumers can pass localized or
domain labels later through renderer hooks.

### Renderer Layer

`SessionTimeline` should render:

- user turns as compact bubbles
- assistant text via shared markdown preview styles
- activity events as lightweight rows
- activity groups as compact summary rows
- raw command/output in collapsed details
- errors as visible alerts
- artifacts/reviews/lessons as existing chips

The default state should not display `Bash Bash done`. Tool names such as
`Bash` can appear in collapsed details or debug-oriented render hooks.

## Component Library Preflight

Checked shared components and patterns:

- `SessionComposer`, `SessionComposerActionBar`, `SessionAttachmentList`
- `SessionTimeline`
- `MarkdownPreview`
- `MessageFlow`, `MessageRow`, `StatusEventPill`, `ToolResultCard`
- `StudioPill`, `StudioActivityRow`, `StudioCollapsibleGroup`
- primitive `IconButton`, `Textarea`, `Select`, dialog primitives

Reusable gaps to close in `packages/component`:

- image-aware attachment item rendering
- lightbox preview for composer images
- activity event types and Codex CLI classifier helpers
- activity row/group renderer
- markdown-backed assistant prose in `SessionTimeline`

App-local UI remains justified only for HR domain content, route state,
workspace/session API calls and material persistence.

## Data Flow

```text
WorkerStudio loads LocalSessionEvent rows
  -> normalizeSessionEvents(events, { parser: 'codex-cli' })
  -> createSessionTimelineViewModel(...)
  -> SessionTimeline renders activity narrative
```

When a parser cannot classify an event, it returns a generic event with raw
details. The UI still renders the turn, and the operator can inspect the detail.

## Error Handling

- Unknown event shapes fall back to generic status/raw activity.
- Unknown commands fall back to "Ran command" with collapsed command/output.
- Tool result without a tool use renders as generic completed tool activity.
- Failed tool result shows failed state and opens details by default.
- Image preview decode is browser-native. If a preview URL cannot be created,
  the attachment still renders as a file row.
- Attachment read failures stay consumer-owned; shared composer renders the
  passed error slot.

## Testing

- Component tests for file/image attachment rows and lightbox behavior.
- Component tests for Codex CLI command classification and generic fallback.
- Component tests for markdown rendering in assistant prose.
- Worker Web tests proving session chat no longer exposes `Bash Bash done` as
  the primary activity label and still keeps command evidence available.
- Existing HR material upload tests remain passing.
- UI governance check, focused package typecheck/build/test, browser smoke and
  code-review-graph review complete the delivery.

## Approval State

The user approved option C and explicitly authorized full execution when no new
major decision is required. This spec keeps the approved boundary: V1 implements
Codex CLI parser support plus generic fallback only; other engines remain future
parser adapters.
