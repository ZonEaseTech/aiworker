# PLAN-377 Session activity pipeline and composer media previews

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: FEAT-103

## Current State

`packages/component` now owns shared Session Kit components from `FEAT-102`.
The remaining visible gap is information hierarchy:

- `SessionTimeline` renders text as plain prose rather than markdown.
- `tool_use` events render as heavy raw tool cards.
- Codex CLI shell activity can surface as `Bash Bash done`.
- Raw command/output evidence is too prominent in the default chat stream.
- `SessionComposer` supports attachment rows, but not image thumbnails or
  lightbox preview.

The backend already parses engine streams into stored local session events. This
plan stays in the shared UI/view-model layer and adds a presentation parser for
Codex CLI activity labels plus generic fallback rendering.

## Proposal

1. Extend shared composer attachment items with image preview metadata and
   lightbox rendering.
2. Add activity event/view-model types and Codex CLI command classification to
   `session-view-model.ts`.
3. Render assistant text with `MarkdownPreview`.
4. Replace the primary tool card look with lightweight activity rows and
   collapsed evidence details.
5. Wire Worker Web session chat to `normalizeSessionEvents(events, { parser:
   'codex-cli' })`.
6. Update tests, catalog, PMA docs and changelog.

## Component Library Preflight

Checked shared components:

- `SessionComposer`, `SessionComposerActionBar`, `SessionAttachmentList`
- `SessionTimeline`
- `MarkdownPreview`
- `MessageFlow`, `MessageRow`, `StatusEventPill`, `ToolResultCard`
- `StudioActivityRow`, `StudioCollapsibleGroup`, `StudioPill`
- primitive `IconButton`, `Textarea`, `Select`

Reusable gaps closed by this plan:

- image-aware composer attachment preview
- composer image lightbox
- Codex CLI activity parser/classifier
- lightweight activity row renderer
- markdown-backed assistant prose in the shared timeline

Local UI exceptions:

- WorkerStudio keeps API, stream, scroll and route state.
- HR keeps profile/material persistence semantics and labels.

## Scope

- `packages/component/src/patterns/session-composer.tsx`
- `packages/component/src/patterns/session-timeline.tsx`
- `packages/component/src/patterns/session-view-model.ts`
- `packages/component/src/patterns/index.ts`
- `packages/component/src/styles/patterns.css`
- `packages/component/src/catalog.ts`
- `packages/component/src/patterns/patterns.test.tsx`
- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA task/plan/changelog files

## Non-Goals

- No Host/Soul protocol, manifest, API or storage schema changes.
- No Claude Code, Cursor, Gemini or OpenCode parser implementation in this
  pass.
- No default composer settings/model/MCP/skill/slash controls.
- No HR profile or QA review meaning inside shared components.

## Risks

- Activity classification can overfit command strings. Mitigation: keep the
  classifier conservative and fall back to generic command activity.
- UI parser naming can look like a protocol contract. Mitigation: keep it in
  `packages/component` view-model helpers for V1.
- Raw evidence can disappear during visual cleanup. Mitigation: tests assert the
  command remains available in details.
- Composer lightbox can become an accessibility trap. Mitigation: use simple
  controlled in-component state, explicit close button and click-away overlay;
  do not implement custom focus trap in this pass.

## Implementation Plan

Detailed implementation steps are tracked in
`docs/superpowers/plans/2026-05-19-session-activity-pipeline.md`.

## Verification

- [x] `bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-component' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' lint`
- [x] `bun run --filter '@zonease/aiworker-web' build`
- [x] `bun run ui:check`
- [x] browser smoke for session activity on a real Codex-backed HR session
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

Notes:

- Browser smoke used the existing local daemon on `127.0.0.1:9217` and a Vite
  Worker Web dev server on `127.0.0.1:5173`.
- The checked session route was
  `/workers/hr-worker/workspaces/workspace-1/sessions/session-1`; the app
  resolved it to a real Codex-backed HR session and rendered `Searched files`
  as a lightweight activity row while retaining the command evidence in
  details.
- The first smoke pass revealed empty `rg` results were treated as failed
  searches; the Codex classifier now treats empty search results as completed
  exploration.
- `crg:review` exited 0 with risk score `0.60`. Its untested symbols point at
  pre-existing concurrent MCP/settings changes in the dirty worktree, not this
  Session Activity Pipeline slice; this slice has direct component and
  WorkerStudio tests listed above.
