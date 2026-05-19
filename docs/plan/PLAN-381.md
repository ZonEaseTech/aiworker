# PLAN-381 Session composer integrated field and signal width polish

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: BUG-142

## Current State

The `BUG-141` slice moved file/image attachments into the shared composer, but
the result still looked assembled from separate regions:

- attachment cards, textarea and action bar were sibling blocks in the form;
- textarea inherited browser resize behavior from the shared textarea baseline;
- pasted image dedupe used `name:size:type:lastModified`, which can differ
  between `DataTransfer.files` and `DataTransfer.items` for the same clipboard
  image;
- session signal rows intentionally used `fit-content`, but this made
  `Session running` and `Session output` look like a different component family
  than command/read-file activity rows.

## Proposal

1. Introduce a shared `session-composer-field` wrapper inside `SessionComposer`
   and place the attachment tray, textarea, warnings and action bar inside it.
2. Move border/background/focus styling to the field shell so composer variants
   look like one input surface rather than stitched blocks.
3. Disable composer textarea resize and keep overflow/height control in shared
   CSS.
4. Normalize pasted file dedupe to `name:size:type`, preserving insertion order
   from `DataTransfer.files` before adding extra item-only files.
5. Remove the `fit-content` signal-row width rule so status/output signals align
   with activity/tool rows while keeping their low-noise tone.

## Component Library Preflight

Checked shared components:

- `SessionComposer`
- `SessionAttachmentList`
- `SessionComposerActionBar`
- `SessionTimeline`
- primitive `Textarea`, `IconButton`, `Select`

Reusable gaps closed:

- integrated composer field shell;
- composer-owned textarea sizing policy;
- timeline signal row width normalization.

Local UI exceptions:

- App wrappers still own their surrounding placement: the session composer
  remains in the chat footer, the workspace composer remains centered, and the
  HR right panel keeps its profile-owned context and proposal copy.

## Scope

- `packages/component/src/patterns/session-composer.tsx`
- `packages/component/src/styles/patterns.css`
- `packages/component/src/patterns/patterns.test.tsx`
- `apps/web/src/styles/session-chat.css`
- `apps/web/src/styles/workspace.css`
- PMA task/plan/changelog files

## Non-Goals

- No drag-and-drop support.
- No new composer controls such as settings, model, MCP, skill or slash.
- No engine parser or Host/Soul protocol changes.

## Verification

- `bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- `git diff --check`
- browser smoke on an HR session route
- `bun run crg:update`
- `bun run crg:review`
