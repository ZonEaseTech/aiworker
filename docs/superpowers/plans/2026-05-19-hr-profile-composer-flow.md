# HR Profile Composer Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the approved HR profile composer flow so Web users can add candidate material, generate a reviewable profile draft, and review/accept it from the center profile surface.

**Architecture:** Keep HR profile semantics inside the HR Soul App workbench while WorkerStudio owns generic session creation and workspace file writes. Uploaded material files are persisted as workspace evidence files, then referenced in session context and metadata. Shared component primitives are reused, but the full HR composer remains app-local until another Soul App needs the same generic shell.

**Tech Stack:** React 19, TypeScript, Vitest, Bun workspaces, existing Worker local file/session APIs, `@zonease/aiworker-component` primitives.

---

## File Structure

- `apps/web/src/worker/__tests__/worker-studio.test.tsx`: focused RTL coverage for the new HR right-panel contract and material submission.
- `apps/web/src/features/local-workspace/api/workspaces.ts`: add `writeFile()` client helper over the existing local file PUT route.
- `apps/web/src/features/local-workspace/api/index.ts`: export `writeFile()`.
- `apps/web/src/worker/souls/types.ts`: extend the workbench submit contract with optional material inputs.
- `apps/web/src/worker/worker-studio.tsx`: default HR to `profile-update-proposal`, persist material files, augment session context/metadata, and keep patch review unchanged.
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`: replace action cards with compact Recent Sessions and the final composer.
- `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-rail.tsx`: remove the obsolete icon rail.
- `apps/web/src/worker/souls/hr/people-workbench/index.tsx`: remove rail state/rendering and collapse the right panel fully.
- `apps/web/src/worker/souls/hr/people-workbench/copy.ts`: add candidate-material/proposal-type labels.
- `apps/web/src/worker/souls/hr/people-workbench/styles.css`: implement the right-panel/composer/file-row layout.
- `apps/web/src/features/i18n/catalog.ts`: add localized copy for `profile-update-proposal`.

### Task 1: RED Tests

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Add a failing right-panel contract test**

Add assertions that expanding the HR right panel shows `Recent Sessions` before `补全 Ada 的候选人档案`, does not render `Next Profile Step`, and no longer renders `.hr-profile-tools-rail` when collapsed.

- [x] **Step 2: Add a failing material submission test**

Use `new File(['resume evidence'], 'ada-resume.txt', { type: 'text/plain' })`, upload it through the hidden material input, verify the compact row and count, submit, and assert the local file PUT plus session metadata includes the material path.

- [x] **Step 3: Run focused tests and confirm RED**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: fail because the old UI still renders `Next Profile Step`, the icon rail, and no material input.

### Task 2: File API and Submit Contract

**Files:**
- Modify: `apps/web/src/features/local-workspace/api/workspaces.ts`
- Modify: `apps/web/src/features/local-workspace/api/index.ts`
- Modify: `apps/web/src/worker/souls/types.ts`

- [x] **Step 1: Add `writeFile()`**

Implement:

```typescript
export function writeFile(workspaceId: string, path: string, content: string): Promise<{ file: LocalFile }> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return localJson(`/api/local/workspaces/${workspaceId}/files/raw/${encodedPath}`, {
    body: content,
    method: 'PUT',
  })
}
```

- [x] **Step 2: Add material input types**

Add `SoulSessionMaterialInput`, `SoulSessionMaterialDescriptor`, and `SoulSessionDraft` to `souls/types.ts`; update `onSubmitSession` to accept `draft?: SoulSessionDraft`.

### Task 3: WorkerStudio Session Materials

**Files:**
- Modify: `apps/web/src/worker/worker-studio.tsx`

- [x] **Step 1: Persist material files before session start**

Add helpers that sanitize filenames, write material content under `evidence/uploads/<timestamp>/`, and return descriptors with `name`, `path`, `mimeType`, `size`, and `encoding`.

- [x] **Step 2: Include material references in context and metadata**

Build the session context from user text plus an `Attached candidate material` list. Add `attachedMaterials` and `materialCount` to session metadata.

- [x] **Step 3: Prefer `profile-update-proposal` for HR**

When the selected Soul is `aiworker-hr` and the template exists, set the selected template to `profile-update-proposal` unless the user has already chosen another HR proposal type.

### Task 4: HR Composer UI

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- Delete: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-rail.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/features/i18n/catalog.ts`

- [x] **Step 1: Remove action-card duplication**

Render compact Recent Sessions first and the composer second. Do not render `Next Profile Step` or action rows.

- [x] **Step 2: Add multi-file material state**

Use a hidden multiple file input. Show compact rows with filename, type, size, and remove action. Show the file count badge on the `+` button.

- [x] **Step 3: Submit material draft**

Read text-like files as UTF-8. Encode non-text files as base64 wrapper content and submit them as material inputs.

- [x] **Step 4: Remove the collapsed icon rail path**

Delete the rail render branch and update panel-toggle behavior so a hidden right panel is fully hidden.

### Task 5: Styles

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/styles.css`

- [x] **Step 1: Right panel layout**

Make the panel a column with compact Recent Sessions at the top and a composer that fills remaining height.

- [x] **Step 2: Composer layout**

Style textarea, attachment rows, fixed-height attachment list, and bottom action bar with existing tokens and no new hex values.

- [x] **Step 3: Hidden panel layout**

Ensure the center profile area expands when the right panel is hidden and no icon rail column remains.

### Task 6: GREEN Verification

**Files:**
- Modify: `docs/task/FEAT-100.md`
- Modify: `docs/plan/PLAN-369.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run focused tests**

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx src/worker/souls/hr/people-workbench/model.test.ts
```

- [x] **Step 2: Run Web gates**

```bash
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' build
```

- [x] **Step 3: Run HR app validation**

```bash
bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr
bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr
```

- [x] **Step 4: Browser smoke**

Open the local Web app, verify the HR right panel, hidden-panel behavior, and file rows visually.

- [x] **Step 5: Final review gates**

```bash
git diff --check
bun run crg:update
bun run crg:review
```
