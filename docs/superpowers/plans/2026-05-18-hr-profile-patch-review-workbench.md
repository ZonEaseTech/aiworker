# HR Profile Patch Review Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HR right-panel markdown review with a center-column, section-aware Profile Patch Review and a lighter Reading Room/Next Step experience.

**Architecture:** Keep the change inside the HR Soul App workbench. Extend the existing `buildProfileRevisionReview` model into a section patch model, pass that model to the Reading Room, center review view and right panel, and keep README promotion on the existing whole-patch approval path.

**Tech Stack:** React 19, TypeScript, Vitest, existing Worker Studio test harness, CSS modules under `apps/web/src/worker/souls/hr/people-workbench/styles.css`.

---

### Task 1: Extend The Profile Patch Model

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/revision-review.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/model.test.ts`

- [ ] **Step 1: Add failing model tests**

Add tests that expect `buildProfileRevisionReview` to expose:

- `changedSections` containing section id, title, status `added | changed`, current markdown and proposed markdown;
- `changedSectionCount`;
- `blockerCount`;
- a blocked review that has `blockerCount > 0`.

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts
```

Expected: the new tests fail because the model fields do not exist.

- [ ] **Step 2: Implement the model**

Update `ProfileRevisionReviewState` and `buildProfileRevisionReview` so ready
reviews parse both current and proposed README markdown, compare the base HR
sections in `HR_PROFILE_SECTION_ORDER`, and classify only changed sections.

Comparison rule:

- if current section markdown is empty and proposed markdown is non-empty,
  status is `added`;
- if both are non-empty and normalized markdown differs, status is `changed`;
- unchanged and empty-to-empty sections are omitted.

Blocked/error reviews should keep `changedSections` empty and set
`blockerCount` from issues.

- [ ] **Step 3: Run model tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts
```

Expected: pass.

### Task 2: Add Reading Room Patch Awareness And Review Mode

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-details.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx`
- Create: `apps/web/src/worker/souls/hr/people-workbench/components/profile-patch-review.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add failing Worker Studio tests**

Add tests for:

- Reading Room shows `Profile patch ready`, changed section count and `Review patch`;
- affected section headings expose `+` or `~` badges;
- clicking `Review patch` switches the center column to `Profile Patch Review`;
- clicking `Back to Reading Room` returns to the Reading Room;
- approving from Profile Patch Review calls the existing profile revision API.

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: new assertions fail because the UI does not exist.

- [ ] **Step 2: Wire review state at the workbench level**

Move `buildProfileRevisionReview` out of `HrProfileToolsPanel` and compute it
once in `HrPeopleWorkbench`, using the selected artifact preview and profile
preview. Add local state for `profilePatchReviewOpen` and
`profilePatchFocusedSectionId`.

- [ ] **Step 3: Render the slim patch strip and section badges**

Pass the review state into `HrProfileDetails` and `HrProfileReadingRoom`. Render
a slim strip when `review.status === 'ready'` and
`review.changedSections.length > 0`, or a blocked strip when
`review.status === 'blocked'`. Render badges on affected section headings.

- [ ] **Step 4: Add the center Profile Patch Review view**

Create `profile-patch-review.tsx`. It renders the heading, changed-section
navigation, side-by-side current/proposed section cards, blocked state, back
button and approve button. The approve button calls the existing
`onPromoteProfileRevision` prop and remains disabled unless the review is ready.

- [ ] **Step 5: Run Worker Studio tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: pass.

### Task 3: Reduce The Right Panel To Next Step

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-rail.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add failing right-panel tests**

Extend Worker Studio tests to assert that expanded profile tools no longer
contain `hr-artifact-markdown-preview`, and that the primary panel action is
`Review patch` when a ready patch exists.

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: fail because the right panel still renders markdown preview.

- [ ] **Step 2: Remove markdown preview from the right panel**

Delete the right-panel `MarkdownPreview` import and raw proposed-change
markdown rendering. Replace the proposal section with compact patch status,
changed section count, blocker count, and a `Review patch` action that opens the
center review mode. Keep the composer below the summary.

- [ ] **Step 3: Limit visible action rows**

Show the recommended action and at most two secondary actions. Put the remaining
actions behind a compact `More actions` disclosure or list that is collapsed by
default.

- [ ] **Step 4: Run Worker Studio tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: pass.

### Task 4: CSS And Responsive Layout

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/styles.css`

- [ ] **Step 1: Add layout styles**

Add styles for:

- `.hr-profile-patch-strip`;
- `.hr-section-patch-badge`;
- `.hr-profile-patch-review`;
- `.hr-profile-patch-review-grid`;
- `.hr-profile-patch-section`;
- reduced `.hr-profile-tools-panel` next-step cards.

Use existing design tokens only. Do not add hex literals or arbitrary colors.

- [ ] **Step 2: Build the Web app**

Run:

```bash
bun run --filter '@zonease/aiworker-web' build
```

Expected: pass.

### Task 5: Verification And Closeout

**Files:**
- Modify: `docs/task/FEAT-096.md`
- Modify: `docs/plan/PLAN-354.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' build
```

Expected: all pass.

- [ ] **Step 2: Run browser smoke**

Open the local HR workspace URL and verify the Reading Room strip, section
badges, Profile Patch Review and right panel on desktop. Also check a narrower
viewport for stacked comparison behavior.

- [ ] **Step 3: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: review exits successfully and reports no blocking issues.

- [ ] **Step 4: Close PMA docs**

Mark `FEAT-096` and `PLAN-354` completed, update indexes and add a changelog
entry with verification evidence.

