# Session Activity Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Session Kit with default file/image composer previews and a Codex CLI activity pipeline that renders readable session chat instead of raw tool cards.

**Architecture:** Keep data loading and session streaming in Host Web. `packages/component` owns shared composer rendering, attachment previews, Codex CLI activity classification, timeline view models and default timeline rendering. Unknown engine events fall back to generic activity detail.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4, Testing Library, `react-markdown`, `remark-gfm`, lucide-react, package-owned CSS in `@zonease/aiworker-component/styles.css`.

---

## File Structure

- Modify `packages/component/src/patterns/session-composer.tsx`: add image-aware attachment rows and lightbox preview support.
- Modify `packages/component/src/patterns/session-view-model.ts`: add attachment preview metadata, Codex CLI activity classification, activity event/group types and fallback detail helpers.
- Modify `packages/component/src/patterns/session-timeline.tsx`: render markdown assistant prose, lightweight activity rows and collapsed raw details.
- Modify `packages/component/src/patterns/patterns.test.tsx`: cover image preview, lightbox, Codex activity classification, fallback and markdown rendering.
- Modify `packages/component/src/patterns/index.ts`: export new activity and attachment types as needed.
- Modify `packages/component/src/styles/patterns.css`: style image attachment rows, lightbox and activity timeline.
- Modify `packages/component/src/catalog.ts`: update Session Kit descriptions to mention activity pipeline and image preview.
- Modify `apps/web/src/worker/session-chat.tsx`: pass `parser: 'codex-cli'` to the shared normalizer.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`: add a Codex tool activity fixture and assertions for human activity labels plus retained command evidence.
- Modify `docs/task/FEAT-103.md`, `docs/plan/PLAN-377.md`, `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`: track and close PMA delivery.

## Tasks

### Task 1: Track PMA Work

- [x] Create `docs/task/FEAT-103.md` with status `in_progress`, owner `codex`, related task `FEAT-102`, and acceptance criteria from the spec.
- [x] Append `FEAT-103` to `docs/task/index.md` with marker `[-]`.
- [x] Create `docs/plan/PLAN-377.md` with status `implementing`, current state, proposal, scope, risks, component-library preflight and verification checklist.
- [x] Append `PLAN-377` to `docs/plan/index.md` with marker `[-]`.

### Task 2: Add Composer Image Preview Contract

- [x] Extend `SessionComposerAttachmentItem` with optional `previewUrl`, `previewAlt`, `mediaType`, `onPreviewLabel` and `previewTitle` fields.
- [x] Add component tests that render an image attachment thumbnail, open a lightbox, close it, and still render non-image files as compact rows.
- [x] Implement image thumbnail button rendering in `SessionAttachmentList`.
- [x] Implement package-owned lightbox markup inside `SessionAttachmentList` using existing button primitives and no app-local dialog state.
- [x] Add styles for thumbnail rows and lightbox overlay.

### Task 3: Add Activity View Model Types And Codex Classifier

- [x] Add `SessionTimelineActivityKind`, `SessionTimelineActivityStatus`, `SessionTimelineActivityDetail`, `SessionTimelineActivityEvent` and `SessionTimelineActivityGroupEvent` types to `session-view-model.ts`.
- [x] Add `normalizeSessionEvents(events, { parser: 'codex-cli' })` overload-compatible options while preserving existing callers.
- [x] Add tests for Codex CLI command classification and empty search-result handling.
- [x] Implement command parsing with conservative regex/token handling.
- [x] Pair tool uses/results before rendering so result status and output stay attached to the activity.
- [x] Preserve raw tool name, command, input and output in `details`.

### Task 4: Render Activity Timeline

- [x] Replace text div rendering with `MarkdownPreview`.
- [x] Add tests that assistant markdown renders list/code/table-friendly markup through `SessionTimeline`.
- [x] Add `SessionActivityRow` and optional grouped summary rendering inside `session-timeline.tsx`.
- [x] Render successful activity rows collapsed and failed activity rows with visible failed status plus expanded details.
- [x] Ensure default labels never render `Bash Bash done` as the primary row.
- [x] Keep raw command and output visible in collapsed details.

### Task 5: Wire Worker Web To Codex Parser

- [x] Update `WorkerSessionChat` to call `normalizeSessionEvents(events, { parser: 'codex-cli' })`.
- [x] Add WorkerStudio test fixture with Codex tool use/result events for a search command.
- [x] Assert the chat shows a human activity label such as `Searched files` or `Searching files`.
- [x] Assert raw command evidence remains available in a details block.
- [x] Preserve existing HR material upload and session chat tests.

### Task 6: Verify And Close

- [x] Run `bun run --filter '@zonease/aiworker-component' test`.
- [x] Run `bun run --filter '@zonease/aiworker-component' typecheck`.
- [x] Run `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`.
- [x] Run `bun run --filter '@zonease/aiworker-web' typecheck`.
- [x] Run `bun run --filter '@zonease/aiworker-web' lint`.
- [x] Run `bun run --filter '@zonease/aiworker-web' build`.
- [x] Run `bun run ui:check`.
- [x] Run `git diff --check`.
- [x] Browser smoke a session timeline with tool activity.
- [x] Run `bun run crg:update` and `bun run crg:review`.
- [x] Mark `FEAT-103` and `PLAN-377` completed and append a changelog entry.
