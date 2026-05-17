# HR Profile Revision Review Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the HR proposed-change panel into a reviewer-facing profile revision workbench.

**Architecture:** Add a pure Web-local model that derives review UI state from current profile Markdown and artifact Markdown. Render that state in the existing HR tools panel while reusing shared `prepareProfileMarkdownForPromotion(...)` validation.

**Tech Stack:** React 19, TypeScript, Vitest, `@zonease/aiworker-shared`, existing HR people workbench components and CSS.

---

### Task 1: Revision Review Model

**Files:**
- Create: `apps/web/src/worker/souls/hr/people-workbench/revision-review.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/model.test.ts`

- [x] **Step 1: Write failing model tests**

Add tests that call `buildProfileRevisionReview(...)` with:

```ts
const current = '# Ada Profile\n\n## Current Profile Summary\n\nCurrent accepted summary.\n'
const artifact = [
  '# Profile Update Proposal',
  '',
  '```aiworker-profile-readme',
  '# Ada Profile',
  '',
  '## Current Profile Summary',
  '',
  'Proposed accepted summary.',
  '```',
].join('\n')
```

Assert:

```ts
expect(review.status).toBe('ready')
expect(review.proposedMarkdown).toContain('Proposed accepted summary.')
expect(review.currentSummary).toContain('Current accepted summary.')
expect(review.proposedSummary).toContain('Proposed accepted summary.')
```

Also cover missing fence and pending review language:

```ts
expect(missingFence.status).toBe('blocked')
expect(missingFence.issues[0]).toContain('aiworker-profile-readme')
expect(pending.status).toBe('blocked')
expect(pending.issues.join(' ')).toContain('pending human review')
```

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts
```

Expected: fail because `buildProfileRevisionReview` does not exist.

- [x] **Step 2: Implement the model**

Create `revision-review.ts` with:

```ts
import { formatProfilePromotionIssues, prepareProfileMarkdownForPromotion } from '@zonease/aiworker-shared'
import { getHrProfileSection, parseHrProfileReadme } from './profile-readme'

export type ProfileRevisionReviewStatus = 'empty' | 'loading' | 'error' | 'blocked' | 'ready'

export interface ProfileRevisionReviewState {
  currentSummary: string
  issues: string[]
  proposedMarkdown: string
  proposedSummary: string
  status: ProfileRevisionReviewStatus
}

export function buildProfileRevisionReview(input: {
  artifactContent: string
  artifactError?: string | null
  artifactLoading: boolean
  currentProfileContent: string
  currentProfileError?: string | null
  currentProfileLoading: boolean
  hasArtifact: boolean
}): ProfileRevisionReviewState {
  if (!input.hasArtifact)
    return emptyReview('empty')
  if (input.artifactLoading || input.currentProfileLoading)
    return emptyReview('loading')
  if (input.artifactError || input.currentProfileError)
    return { ...emptyReview('error'), issues: [input.artifactError || input.currentProfileError || 'Profile revision preview is unavailable.'] }

  const prepared = prepareProfileMarkdownForPromotion({
    artifactMarkdown: input.artifactContent,
    requireFencedDraft: true,
  })
  if (!prepared.ok)
    return { ...emptyReview('blocked'), currentSummary: summaryFromProfile(input.currentProfileContent), issues: [formatProfilePromotionIssues(prepared.issues)] }

  return {
    currentSummary: summaryFromProfile(input.currentProfileContent),
    issues: [],
    proposedMarkdown: prepared.profileMarkdown,
    proposedSummary: summaryFromProfile(prepared.profileMarkdown),
    status: 'ready',
  }
}

function emptyReview(status: ProfileRevisionReviewStatus): ProfileRevisionReviewState {
  return { currentSummary: '', issues: [], proposedMarkdown: '', proposedSummary: '', status }
}

function summaryFromProfile(markdown: string): string {
  const parsed = parseHrProfileReadme(markdown)
  return (getHrProfileSection(parsed, 'currentProfileSummary')?.body || parsed.intro || markdown).trim()
}
```

- [x] **Step 3: Verify model tests pass**

Run the model test command again.

Expected: pass.

### Task 2: Render Review State In The Tools Panel

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Write failing Worker Web tests**

Extend the existing profile promotion test to expect:

```ts
expect(within(proposedChange).getByText('Ready to approve')).toBeTruthy()
expect(within(proposedChange).getByText('Current accepted summary.')).toBeTruthy()
expect(within(proposedChange).getByText('Reviewed profile summary.')).toBeTruthy()
```

Add a second test where the artifact raw endpoint returns a proposal without
`aiworker-profile-readme`, then expect:

```ts
expect(within(proposedChange).getByText('Revision blocked')).toBeTruthy()
expect(within(proposedChange).getByRole('button', { name: 'Approve Profile Revision' })).toBeDisabled()
```

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t 'profile revision'
```

Expected: fail because the UI does not render the review state.

- [x] **Step 2: Add copy labels**

Add labels to `HrWorkbenchCopy` and both locale objects:

```ts
revisionBlocked: string
revisionComparisonTitle: string
revisionCurrentTitle: string
revisionDraftTitle: string
revisionReady: string
revisionStatusTitle: string
```

English values:

```ts
revisionBlocked: 'Revision blocked',
revisionComparisonTitle: 'Profile revision comparison',
revisionCurrentTitle: 'Current accepted profile',
revisionDraftTitle: 'Accepted draft',
revisionReady: 'Ready to approve',
revisionStatusTitle: 'Revision status',
```

Chinese values:

```ts
revisionBlocked: '修订被阻止',
revisionComparisonTitle: '档案修订对比',
revisionCurrentTitle: '当前已接受档案',
revisionDraftTitle: '待接受草案',
revisionReady: '可批准',
revisionStatusTitle: '修订状态',
```

- [x] **Step 3: Render the review model**

In `ProfileToolsPanelProps`, add `profilePreview: SoulProfilePreviewState`.
Build review state with `buildProfileRevisionReview(...)` using selected
artifact and preview state. Render:

```tsx
<div className={`hr-revision-status ${revisionReview.status}`}>
  <strong>{revisionReview.status === 'ready' ? labels.revisionReady : labels.revisionBlocked}</strong>
  {revisionReview.issues.map(issue => <small key={issue}>{issue}</small>)}
</div>
```

When ready, render the current/proposed summaries:

```tsx
<div className="hr-revision-comparison" aria-label={labels.revisionComparisonTitle}>
  <div>
    <strong>{labels.revisionCurrentTitle}</strong>
    <p>{revisionReview.currentSummary || labels.currentProfileEmpty}</p>
  </div>
  <div>
    <strong>{labels.revisionDraftTitle}</strong>
    <p>{revisionReview.proposedSummary || labels.currentProfileEmpty}</p>
  </div>
</div>
```

Use `revisionReview.proposedMarkdown || artifactPreview.content` for the
Markdown preview content. Disable approval unless `revisionReview.status ===
'ready'`.

- [x] **Step 4: Style the review state**

Add dense CSS classes:

```css
.hr-revision-status { ... }
.hr-revision-status.ready { ... }
.hr-revision-status.blocked { ... }
.hr-revision-comparison { ... }
.hr-revision-comparison > div { ... }
```

Use existing tokens only.

- [x] **Step 5: Verify Web tests pass**

Run the focused Worker Web test command.

Expected: pass.

### Task 3: Closeout

**Files:**
- Modify: `docs/task/FEAT-095.md`
- Modify: `docs/plan/PLAN-348.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run final gates**

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' build
bun run lint
git diff --check
bun run crg:update
bun run crg:review
```

- [x] **Step 2: Complete PMA docs**

Set `FEAT-095` and `PLAN-348` to completed, update indexes to `[x]`, and add a
changelog entry for the HR Profile Revision Review Workbench.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/worker/souls/hr/people-workbench apps/web/src/worker/__tests__/worker-studio.test.tsx docs
git commit -m "feat: 优化 HR profile revision review 工作台"
```
