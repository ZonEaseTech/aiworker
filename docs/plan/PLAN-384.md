# PLAN-384 Session composer attachment deduplication

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: BUG-145

## Current State

`SessionComposer` deduplicated duplicate files from a single clipboard payload,
but the Worker Web `SessionTurnComposer` owned the actual attachment state and
always appended every incoming file. As a result, selecting or pasting the same
file/image multiple times produced duplicate preview cards, badge counts and
submitted source material descriptors.

## Root Cause

The dedupe boundary was too low-level. Clipboard dedupe handled duplicated
`DataTransfer.files` and `DataTransfer.items` entries from the same paste event,
but there was no state-level dedupe across multiple add events or mixed entry
paths.

## Proposal

1. Keep the shared `SessionComposer` paste payload dedupe.
2. Add state-level dedupe in `SessionTurnComposer.addAttachmentFiles`.
3. Use `name:size:type` as the attachment identity so picker/paste duplicates
   match the shared component's existing semantics.
4. Create preview object URLs only for files that survive dedupe.
5. Cover repeated file selection in the WorkerStudio follow-up composer test.

## Component Library Preflight

Checked shared components:

- `SessionComposer`
- `SessionAttachmentList`
- `filesFromDataTransfer`

Reusable gap:

- The missing behavior was in Worker Web's stateful wrapper, not the stateless
  shared attachment list. The shared component still owns per-event clipboard
  payload cleanup.

Local UI exceptions:

- None. This is behavior in the Host Web wrapper around the shared composer.

## Scope

- `apps/web/src/worker/session-turn-composer.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA task/plan/changelog files

## Non-Goals

- No content hashing or binary file reads for dedupe.
- No upload persistence or server-side material dedupe.
- No changes to attachment rendering density.

## Verification

- red test: `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "submits source material files"`
- green test: same command
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- `git diff --check`
- browser smoke with repeated file upload
- `bun run crg:update`
- `bun run crg:review`
