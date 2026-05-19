# PLAN-380 Session composer attachment paste and card UX

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: BUG-141

## Current State

`SessionComposer` already owned shared action-bar and attachment rendering, but
its attachment behavior was incomplete:

- paste events on the textarea only changed text and ignored clipboard files;
- consumer components opened hidden file inputs directly, without clearing stale
  values before picker open;
- app-local `display: none` inputs made picker behavior more brittle than a
  visually hidden input;
- the attachment list rendered as rows below the textarea instead of as
  first-class composer body content.

## Proposal

1. Add a shared `onAddAttachmentFiles` callback to `SessionComposer` paste
   handling and normalize `DataTransfer.files` / `DataTransfer.items`.
2. Move attachment rendering above the textarea and restyle it as image tiles
   and file cards while keeping the existing lightbox preview contract.
3. Update HR profile, workspace new-session and session follow-up composer
   consumers to accept `File[]`, clear the input value before opening the picker
   and clear it after selection.
4. Replace `display: none` file inputs with visually hidden inputs.
5. Add focused component and WorkerStudio regression coverage, then run the
   matching frontend gates and CRG review.

## Component Library Preflight

Checked shared components:

- `SessionComposer`
- `SessionComposerActionBar`
- `SessionAttachmentList`
- primitive `IconButton`, `Textarea`

Reusable gaps closed:

- composer-level pasted attachment ingestion;
- composer-internal image tile and file card attachment layout;
- shared visually hidden file input class for picker stability.

Local UI exceptions:

- HR, workspace and follow-up wrappers still own material persistence,
  domain-specific copy and prompt/metadata assembly. They only pass files into
  the shared composer contract.

## Scope

- `packages/component/src/patterns/session-composer.tsx`
- `packages/component/src/styles/patterns.css`
- `packages/component/src/patterns/patterns.test.tsx`
- `apps/web/src/worker/session-turn-composer.tsx`
- `apps/web/src/features/local-workspace/components/session-composer.tsx`
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- `apps/web/src/styles/workspace.css`
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA task/plan/changelog files

## Non-Goals

- No drag-and-drop attachment ingestion in this slice.
- No settings/model/MCP/skill/slash controls in the default composer.
- No Host/Soul protocol, storage schema or engine parser changes.

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
