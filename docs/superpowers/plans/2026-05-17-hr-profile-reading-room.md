# HR Profile Reading Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make AIWorker HR profile-first by using a plain Markdown README base-section contract and a Web Reading Room renderer that preserves the existing three-column, full-height scroll layout.

**Architecture:** Keep `README.md` as the canonical linear Markdown profile. Add HR-local section parsing and rendering in the People Workbench so the center column becomes the reading surface while the right column defaults to a collapsed tools rail. Keep profile promotion and review boundaries unchanged.

**Tech Stack:** React 19, TypeScript, Vitest, Bun workspaces, MarkdownPreview from `@zonease/aiworker-component`, existing CSS variable design tokens.

---

## File Structure

- Modify `apps/aiworker-hr/engine-assets/workspace/README.md`
  - Source template for official HR profile workspaces.
- Modify `packages/core/src/worker/profile-ledger.ts`
  - Generic fallback initial profile README when app workspace assets are absent.
- Modify `packages/core/src/worker/runtime.test.ts`
  - Runtime coverage for new README base sections from app assets and fallback renderer.
- Create `apps/web/src/worker/souls/hr/people-workbench/profile-readme.ts`
  - HR-local Markdown section parser and helpers.
- Modify `apps/web/src/worker/souls/hr/people-workbench/model.test.ts`
  - Unit tests for parsing known, missing and unknown README sections.
- Create `apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx`
  - Center-column README renderer.
- Modify `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
  - Expanded right drawer with sources, proposed change, guardrails, sessions and actions.
- Create `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-rail.tsx`
  - Collapsed icon rail for profile tools.
- Modify `apps/web/src/worker/souls/hr/people-workbench/components/index.ts`
  - Export new components if the local pattern requires it.
- Modify `apps/web/src/worker/souls/hr/people-workbench/components/profile-details.tsx`
  - Replace mixed center-column cards with the new Reading Room component.
- Modify `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
  - Change tools visibility state from removed-column toggle to collapsed rail/expanded drawer.
- Modify `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
  - Add labels for base sections, rail buttons and fallback copy.
- Modify `apps/web/src/worker/souls/hr/people-workbench/styles.css`
  - Preserve three full-height columns, independent scroll areas, and collapsed rail width.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Integration tests for Reading Room focus, collapsed tools rail, drawer expansion and promotion.
- Modify PMA files:
  - `docs/task/FEAT-093.md`
  - `docs/task/index.md`
  - `docs/plan/PLAN-340.md`
  - `docs/plan/index.md`
  - `docs/changelog.md`

## Task 1: Claim PMA Tracking

**Files:**
- Create: `docs/task/FEAT-093.md`
- Modify: `docs/task/index.md`
- Create: `docs/plan/PLAN-340.md`
- Modify: `docs/plan/index.md`

- [x] **Step 1: Create the task detail file**

Create `docs/task/FEAT-093.md`:

```md
# FEAT-093 HR Profile Reading Room

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-17
- **plan**: PLAN-340
- **spec**: docs/superpowers/specs/2026-05-17-hr-profile-reading-room-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-17-hr-profile-reading-room.md
- **relatesTo**: apps/aiworker-hr, apps/web/src/worker/souls/hr/people-workbench, packages/core/src/worker/profile-ledger.ts

## Context

AIWorker HR already treats `README.md` as the accepted People Profile, but the
current workbench presents sources, proposed changes and review guardrails as
peer center-column cards. Users cannot immediately focus on the accepted
profile summary.

## Goals

- Define a plain Markdown HR README base-section contract.
- Render the accepted README as the center-column Reading Room.
- Keep the existing three-column full-height layout with independent scroll.
- Collapse the right tools column into an icon rail by default.
- Preserve review-gated profile promotion.

## Non-Goals

- Do not make README depend on HTML, frontmatter or Web-only layout metadata.
- Do not build a block editor.
- Do not remove artifacts, reviews, sessions or lessons.
- Do not let Host infer HR profile meaning outside the HR workbench renderer.

## Acceptance Criteria

- New HR workspaces seed README with identity, role, capability, evidence,
  risk, next-action, review and accepted-external-section headings.
- The HR workbench center column foregrounds `Current Profile Summary` and
  person/profile base sections.
- Sources, proposed changes, guardrails and sessions are available from the
  right rail/drawer but not shown as peer center cards by default.
- Desktop layout keeps profile list, reading room and tools rail/drawer as
  full-height independently scrolling columns.
- Profile promotion still writes `README.md` only through review.

## Verification

- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-17: Claimed for HR Profile Reading Room implementation after the
  Superpowers design spec was approved.
```

- [x] **Step 2: Append task index line**

Append to `docs/task/index.md`:

```md
- [-] [**FEAT-093 HR Profile Reading Room**](FEAT-093.md) `P0`
```

- [x] **Step 3: Create the PMA plan detail**

Create `docs/plan/PLAN-340.md`:

```md
# PLAN-340 HR Profile Reading Room

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **relatedTask**: FEAT-093

## Current State

The HR app has a profile ledger and the Web workbench renders `README.md` as
`Current Profile Summary`, but the center column also renders profile sources,
proposed change preview and review guardrails as peer cards. The existing
workspace README seed lacks identity, role, capability and responsibility
sections, so it reads as an audit note rather than a people profile.

## Proposal

1. Update HR and fallback profile README seeds to a plain Markdown base-section
   contract.
2. Add an HR-local README section parser.
3. Replace the center mixed details card with a Reading Room renderer.
4. Move sources, proposed change, guardrails and sessions into a right tools
   rail/drawer that is collapsed by default.
5. Update focused runtime and Web tests.

## Risks

- The section parser could make README rendering fragile; fallback to full
  MarkdownPreview is required.
- Moving the proposed change preview could weaken the promotion flow; tests must
  prove the drawer path still promotes reviewed content.
- CSS changes could accidentally remove the existing independent scroll
  behavior; tests and browser smoke must check the layout.

## Scope

- `apps/aiworker-hr/engine-assets/workspace/README.md`
- `packages/core/src/worker/profile-ledger.ts`
- `packages/core/src/worker/runtime.test.ts`
- `apps/web/src/worker/souls/hr/people-workbench/**`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA/changelog docs

## Verification

- Not run at claim time. Required verification commands are listed in Task 7.
```

- [x] **Step 4: Append plan index line**

Append to `docs/plan/index.md`:

```md
- [-] [**PLAN-340 HR Profile Reading Room**](PLAN-340.md) `2026-05-17`
```

- [x] **Step 5: Verify tracking files**

Run:

```bash
rg -n "FEAT-093|PLAN-340" docs/task docs/plan
```

Expected: `FEAT-093.md`, `docs/task/index.md`, `PLAN-340.md`, and `docs/plan/index.md` all contain the new ids.

## Task 2: README Base Section Contract

**Files:**
- Modify: `apps/aiworker-hr/engine-assets/workspace/README.md`
- Modify: `packages/core/src/worker/profile-ledger.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`

- [x] **Step 1: Write failing runtime assertions**

In `packages/core/src/worker/runtime.test.ts`, extend the profile workspace
bootstrap assertions:

```ts
const readme = await readFile(join(workspace.rootPath, 'README.md'), 'utf8')
expect(readme).toContain('## Current Profile Summary')
expect(readme).toContain('## Identity And Basics')
expect(readme).toContain('## Role Context And Responsibilities')
expect(readme).toContain('## Capabilities And Stack')
expect(readme).toContain('## Accepted External Sections')
```

Also extend the Soul App without native skills test:

```ts
const readme = await readFile(join(workspace.rootPath, 'README.md'), 'utf8')
expect(readme).toContain('## Identity And Basics')
expect(readme).toContain('## Review State')
expect(readme).toContain('No approved profile revision yet.')
```

- [x] **Step 2: Run the focused red test**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
```

Expected: FAIL because the current test fixture `writeWorkspaceEngineAssets`
and fallback renderer do not include the new headings.

- [x] **Step 3: Update the official HR README template**

Replace `apps/aiworker-hr/engine-assets/workspace/README.md` with:

```md
# {{workspaceName}}

> Accepted People Profile for this HR workspace. Agent outputs remain proposals until review.

## Current Profile Summary

No approved profile revision yet.

## Identity And Basics

- Lifecycle: Unknown
- Target role: Unknown
- Current stage: Not started
- Profile confidence: No accepted evidence yet

## Role Context And Responsibilities

No accepted role context yet.

## Capabilities And Stack

- No accepted capabilities yet.

## Confirmed Facts

- No confirmed facts yet.

## Evidence Status

| Signal | Status | Source |
| --- | --- | --- |
| Profile baseline | Missing | No approved revision |

## Risks And Gaps

- No accepted risks or gaps yet.

## Next HR Actions

- Approve a profile revision to update this README.

## Review State

No approved profile revision yet.

## Accepted External Sections

- None yet.
```

- [x] **Step 4: Update fallback profile renderer**

In `packages/core/src/worker/profile-ledger.ts`, update
`renderInitialProfileReadme` to return the same section structure with the
generic first block:

```ts
function renderInitialProfileReadme(name: string): string {
  return [
    `# ${name}`,
    '',
    '> Accepted People Profile for this workspace. Agent outputs remain proposals until review.',
    '',
    '## Current Profile Summary',
    '',
    'No approved profile revision yet.',
    '',
    '## Identity And Basics',
    '',
    '- Lifecycle: Unknown',
    '- Target role: Unknown',
    '- Current stage: Not started',
    '- Profile confidence: No accepted evidence yet',
    '',
    '## Role Context And Responsibilities',
    '',
    'No accepted role context yet.',
    '',
    '## Capabilities And Stack',
    '',
    '- No accepted capabilities yet.',
    '',
    '## Confirmed Facts',
    '',
    '- No confirmed facts yet.',
    '',
    '## Evidence Status',
    '',
    '| Signal | Status | Source |',
    '| --- | --- | --- |',
    '| Profile baseline | Missing | No approved revision |',
    '',
    '## Risks And Gaps',
    '',
    '- No accepted risks or gaps yet.',
    '',
    '## Next HR Actions',
    '',
    '- Approve a profile revision to update this README.',
    '',
    '## Review State',
    '',
    'No approved profile revision yet.',
    '',
    '## Accepted External Sections',
    '',
    '- None yet.',
    '',
  ].join('\n')
}
```

- [x] **Step 5: Update the runtime test helper fixture**

In `writeWorkspaceEngineAssets`, write the same base sections to the test app
`engine-assets/workspace/README.md` so the asset-projection test proves the new
app-owned template path too.

- [x] **Step 6: Run focused runtime test**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
```

Expected: PASS.

## Task 3: HR README Section Parser

**Files:**
- Create: `apps/web/src/worker/souls/hr/people-workbench/profile-readme.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/model.test.ts`

- [x] **Step 1: Add parser tests**

In `model.test.ts`, import parser helpers:

```ts
import {
  HR_PROFILE_SECTION_ORDER,
  getHrProfileSection,
  parseHrProfileReadme,
} from './profile-readme'
```

Add tests:

```ts
it('parses HR profile README sections without losing unknown notes', () => {
  const parsed = parseHrProfileReadme([
    '# Ada Chen',
    '',
    'Intro before sections.',
    '',
    '## Current Profile Summary',
    '',
    'Accepted profile summary.',
    '',
    '## Identity And Basics',
    '',
    '- Lifecycle: Candidate',
    '- Target role: Senior Product Manager',
    '',
    '## Capabilities And Stack',
    '',
    '- SQL analytics',
    '',
    '## Custom Notes',
    '',
    'Keep this unknown section.',
    '',
  ].join('\n'))

  expect(parsed.title).toBe('Ada Chen')
  expect(parsed.intro).toContain('Intro before sections.')
  expect(getHrProfileSection(parsed, 'currentProfileSummary')?.body).toContain('Accepted profile summary.')
  expect(getHrProfileSection(parsed, 'identityAndBasics')?.body).toContain('Lifecycle: Candidate')
  expect(getHrProfileSection(parsed, 'capabilitiesAndStack')?.body).toContain('SQL analytics')
  expect(parsed.unknownSections).toEqual([
    { body: 'Keep this unknown section.', heading: 'Custom Notes' },
  ])
})

it('keeps a legacy README renderable when base sections are missing', () => {
  const parsed = parseHrProfileReadme('# Legacy Profile\n\nAccepted profile summary.\n')

  expect(parsed.title).toBe('Legacy Profile')
  expect(parsed.intro).toContain('Accepted profile summary.')
  expect(HR_PROFILE_SECTION_ORDER.map(section => section.id)).toContain('currentProfileSummary')
  expect(getHrProfileSection(parsed, 'currentProfileSummary')).toBeNull()
})
```

- [x] **Step 2: Run parser tests red**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts
```

Expected: FAIL because `profile-readme.ts` does not exist.

- [x] **Step 3: Implement parser**

Create `profile-readme.ts`:

```ts
export type HrProfileSectionId =
  | 'currentProfileSummary'
  | 'identityAndBasics'
  | 'roleContextAndResponsibilities'
  | 'capabilitiesAndStack'
  | 'confirmedFacts'
  | 'evidenceStatus'
  | 'risksAndGaps'
  | 'nextHrActions'
  | 'reviewState'
  | 'acceptedExternalSections'

export interface HrProfileSectionDefinition {
  id: HrProfileSectionId
  title: string
}

export interface HrProfileReadmeSection {
  body: string
  heading: string
}

export interface HrProfileReadme {
  intro: string
  sections: Partial<Record<HrProfileSectionId, HrProfileReadmeSection>>
  title: string | null
  unknownSections: HrProfileReadmeSection[]
}

export const HR_PROFILE_SECTION_ORDER = [
  { id: 'currentProfileSummary', title: 'Current Profile Summary' },
  { id: 'identityAndBasics', title: 'Identity And Basics' },
  { id: 'roleContextAndResponsibilities', title: 'Role Context And Responsibilities' },
  { id: 'capabilitiesAndStack', title: 'Capabilities And Stack' },
  { id: 'confirmedFacts', title: 'Confirmed Facts' },
  { id: 'evidenceStatus', title: 'Evidence Status' },
  { id: 'risksAndGaps', title: 'Risks And Gaps' },
  { id: 'nextHrActions', title: 'Next HR Actions' },
  { id: 'reviewState', title: 'Review State' },
  { id: 'acceptedExternalSections', title: 'Accepted External Sections' },
] as const satisfies readonly HrProfileSectionDefinition[]

const sectionByTitle = new Map<string, HrProfileSectionId>(
  HR_PROFILE_SECTION_ORDER.map(section => [normalizeHeading(section.title), section.id]),
)

export function parseHrProfileReadme(markdown: string): HrProfileReadme {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const titleMatch = normalized.match(/^#\s+(.+?)\s*$/m)
  const title = titleMatch?.[1]?.trim() || null
  const headingMatches = Array.from(normalized.matchAll(/^##\s+(.+?)\s*$/gm))
  const firstHeadingIndex = headingMatches[0]?.index ?? normalized.length
  const intro = normalized.slice(0, firstHeadingIndex).trim()
  const sections: Partial<Record<HrProfileSectionId, HrProfileReadmeSection>> = {}
  const unknownSections: HrProfileReadmeSection[] = []

  headingMatches.forEach((match, index) => {
    const heading = match[1]?.trim() ?? ''
    const bodyStart = (match.index ?? 0) + match[0].length
    const bodyEnd = headingMatches[index + 1]?.index ?? normalized.length
    const body = normalized.slice(bodyStart, bodyEnd).trim()
    const id = sectionByTitle.get(normalizeHeading(heading))
    const section = { body, heading }
    if (id)
      sections[id] = section
    else
      unknownSections.push(section)
  })

  return {
    intro,
    sections,
    title,
    unknownSections,
  }
}

export function getHrProfileSection(readme: HrProfileReadme, id: HrProfileSectionId): HrProfileReadmeSection | null {
  return readme.sections[id] ?? null
}

function normalizeHeading(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}
```

- [x] **Step 4: Run parser tests green**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts
```

Expected: PASS.

## Task 4: Reading Room Center Renderer

**Files:**
- Create: `apps/web/src/worker/souls/hr/people-workbench/components/profile-reading-room.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-details.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Update Web fixture README content**

In `resetSettings`, replace the current profile fixture with a base-section
README:

```ts
currentProfiles = {
  'workspace-1': [
    '# Hiring Workspace',
    '',
    '## Current Profile Summary',
    '',
    'Accepted profile summary.',
    '',
    '## Identity And Basics',
    '',
    '- Lifecycle: Candidate',
    '- Target role: Senior Product Manager',
    '',
    '## Role Context And Responsibilities',
    '',
    'Own product discovery and marketplace growth execution.',
    '',
    '## Capabilities And Stack',
    '',
    '- SQL analytics',
    '- Experiment design',
    '',
    '## Confirmed Facts',
    '',
    '- Completed recruiter screen.',
    '',
    '## Evidence Status',
    '',
    '| Signal | Status | Source |',
    '| --- | --- | --- |',
    '| Product discovery | Supported | Interview notes |',
    '',
    '## Risks And Gaps',
    '',
    '- Reference check is missing.',
    '',
    '## Next HR Actions',
    '',
    '- Request reviewer decision.',
    '',
    '## Review State',
    '',
    'Accepted profile baseline is reviewed.',
    '',
    '## Accepted External Sections',
    '',
    '- Interview Brief: reviews/interview-brief.md',
    '',
  ].join('\n'),
}
```

- [x] **Step 2: Update failing integration expectations**

In the specialized HR workbench integration test, expect the center to contain
base profile sections and not contain proposed/support cards:

```ts
const hrDetails = document.querySelector('.hr-profile-details') as HTMLElement
expect(within(hrDetails).getAllByText('Current Profile Summary').length).toBeGreaterThan(0)
expect(await within(hrDetails).findByText('Accepted profile summary.')).toBeTruthy()
expect(within(hrDetails).getByText('Identity And Basics')).toBeTruthy()
expect(within(hrDetails).getByText('Role Context And Responsibilities')).toBeTruthy()
expect(within(hrDetails).getByText('Capabilities And Stack')).toBeTruthy()
expect(within(hrDetails).queryByText('Profile sources')).toBeNull()
expect(within(hrDetails).queryByText('Proposed Change')).toBeNull()
expect(within(hrDetails).queryByText('Review guardrails')).toBeNull()
```

- [x] **Step 3: Run integration test red**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL because center still renders support cards.

- [x] **Step 4: Add copy labels**

Add to `HrWorkbenchCopy`:

```ts
acceptedExternalSectionsTitle: string
baseSectionEmpty: string
identitySnapshotTitle: string
otherProfileNotesTitle: string
profileReadingRoomDetail: (profileName: string) => string
profileReadingRoomFallback: string
```

English values:

```ts
acceptedExternalSectionsTitle: 'Accepted External Sections',
baseSectionEmpty: 'No accepted content in this section yet.',
identitySnapshotTitle: 'Profile baseline',
otherProfileNotesTitle: 'Other Profile Notes',
profileReadingRoomDetail: profileName => `${profileName} accepted README profile baseline.`,
profileReadingRoomFallback: 'Showing the accepted README as written.',
```

Chinese values:

```ts
acceptedExternalSectionsTitle: '已接受的外部章节',
baseSectionEmpty: '这个章节还没有已接受内容。',
identitySnapshotTitle: '档案基线',
otherProfileNotesTitle: '其他档案备注',
profileReadingRoomDetail: profileName => `${profileName} 的已接受 README 档案基线。`,
profileReadingRoomFallback: '按原始 README 展示已接受档案。',
```

- [x] **Step 5: Create Reading Room component**

Create `profile-reading-room.tsx`:

```tsx
import type { SoulProfilePreviewState } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile } from '../types'

import { BookOpenText, FileText } from 'lucide-react'
import { lazy, Suspense, useMemo } from 'react'
import { WorkbenchSectionTitle } from '../../../common'
import { getHrProfileSection, HR_PROFILE_SECTION_ORDER, parseHrProfileReadme } from '../profile-readme'

const MarkdownPreview = lazy(() => import('@zonease/aiworker-component/markdown-preview').then(module => ({ default: module.MarkdownPreview })))

interface HrProfileReadingRoomProps {
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  profilePreview: SoulProfilePreviewState
}

export function HrProfileReadingRoom({ focusedProfile, labels, profilePreview }: HrProfileReadingRoomProps) {
  const profilePreviewMatchesProfile = Boolean(focusedProfile && profilePreview.workspaceId === focusedProfile.id)
  const parsed = useMemo(() => {
    if (!profilePreviewMatchesProfile || profilePreview.loading || profilePreview.error)
      return null
    return parseHrProfileReadme(profilePreview.content)
  }, [profilePreview.content, profilePreview.error, profilePreview.loading, profilePreviewMatchesProfile])

  if (!profilePreviewMatchesProfile || profilePreview.loading)
    return <div className="hr-artifact-preview-empty">{labels.currentProfileLoading}</div>

  if (profilePreview.error)
    return <div className="hr-artifact-preview-empty" role="alert">{`${labels.currentProfileError} ${profilePreview.error}`}</div>

  if (!parsed)
    return <FullMarkdown content={profilePreview.content} empty={labels.currentProfileEmpty} />

  const summary = getHrProfileSection(parsed, 'currentProfileSummary')
  const primarySections = HR_PROFILE_SECTION_ORDER.filter(section => section.id !== 'currentProfileSummary')

  return (
    <article className="hr-reading-room" data-testid="hr-current-profile-summary">
      <WorkbenchSectionTitle
        icon={<BookOpenText size={15} />}
        title={parsed.title ?? focusedProfile?.name ?? labels.profileDetailsTitle}
        detail={focusedProfile ? labels.profileReadingRoomDetail(focusedProfile.name) : labels.profileReadingRoomFallback}
      />
      <section className="hr-reading-summary">
        <h2>{labels.profileDetailsTitle}</h2>
        <MarkdownSection content={summary?.body} empty={labels.currentProfileEmpty} />
      </section>
      <div className="hr-reading-section-grid">
        {primarySections.map(section => (
          <section key={section.id} className={`hr-reading-section ${section.id}`}>
            <h3>{section.title}</h3>
            <MarkdownSection content={getHrProfileSection(parsed, section.id)?.body} empty={labels.baseSectionEmpty} />
          </section>
        ))}
        {parsed.unknownSections.length > 0
          ? (
              <section className="hr-reading-section">
                <h3>{labels.otherProfileNotesTitle}</h3>
                {parsed.unknownSections.map(section => (
                  <div key={section.heading} className="hr-reading-unknown-section">
                    <h4>{section.heading}</h4>
                    <MarkdownSection content={section.body} empty={labels.baseSectionEmpty} />
                  </div>
                ))}
              </section>
            )
          : null}
      </div>
    </article>
  )
}

function MarkdownSection({ content, empty }: { content: string | undefined, empty: string }) {
  return <FullMarkdown content={content?.trim() ?? ''} empty={empty} />
}

function FullMarkdown({ content, empty }: { content: string, empty: string }) {
  return (
    <Suspense fallback={<div className="hr-markdown-preview hr-reading-markdown" />}>
      <MarkdownPreview
        className="hr-markdown-preview hr-reading-markdown"
        content={content}
        empty={<span>{empty}</span>}
      />
    </Suspense>
  )
}
```

- [x] **Step 6: Replace center content**

In `profile-details.tsx`, remove the sources/proposed change/guardrails markup
from the center and render:

```tsx
return (
  <section className="hr-profile-details" aria-label={labels.profileDetailsTitle}>
    <HrProfileReadingRoom
      focusedProfile={focusedProfile}
      labels={labels}
      profilePreview={profilePreview}
    />
  </section>
)
```

Remove any now-unused props and imports from `profile-details.tsx` after the
right drawer receives the moved support surfaces in Task 5.

- [x] **Step 7: Run integration test toward green**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL until Task 5 moves the proposed change path into the right drawer.
The center-column assertions should no longer find proposed/support cards.

## Task 5: Right Tools Rail And Drawer

**Files:**
- Create: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-rail.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Add rail/drawer labels**

Add to `HrWorkbenchCopy`:

```ts
expandProfileTools: string
collapseProfileTools: string
openEvidenceTools: string
openProposedChange: string
openReviewGuardrails: string
openSessionTools: string
profileToolsRailLabel: string
```

English:

```ts
expandProfileTools: 'Expand Profile Tools',
collapseProfileTools: 'Collapse Profile Tools',
openEvidenceTools: 'Open Profile Sources',
openProposedChange: 'Open Proposed Change',
openReviewGuardrails: 'Open Review Guardrails',
openSessionTools: 'Open Sessions And Actions',
profileToolsRailLabel: 'Collapsed Profile Tools',
```

Chinese:

```ts
expandProfileTools: '展开档案工具',
collapseProfileTools: '收起档案工具',
openEvidenceTools: '打开档案来源',
openProposedChange: '打开变更提案',
openReviewGuardrails: '打开 Review 护栏',
openSessionTools: '打开 Session 与操作',
profileToolsRailLabel: '已收起的档案工具',
```

- [x] **Step 2: Create rail component**

Create `profile-tools-rail.tsx`:

```tsx
import type { HrWorkbenchCopy } from '../copy'

import { FileCheck2, FileText, ListChecks, MessageSquareText } from 'lucide-react'

interface HrProfileToolsRailProps {
  labels: HrWorkbenchCopy
  onExpand: () => void
}

export function HrProfileToolsRail({ labels, onExpand }: HrProfileToolsRailProps) {
  const items = [
    { icon: FileText, label: labels.openEvidenceTools },
    { icon: FileCheck2, label: labels.openProposedChange },
    { icon: ListChecks, label: labels.openReviewGuardrails },
    { icon: MessageSquareText, label: labels.openSessionTools },
  ]

  return (
    <aside className="hr-profile-tools-rail" aria-label={labels.profileToolsRailLabel}>
      {items.map(({ icon: Icon, label }) => (
        <button key={label} type="button" className="hr-tools-rail-button" aria-label={label} title={label} onClick={onExpand}>
          <Icon aria-hidden="true" size={16} />
        </button>
      ))}
    </aside>
  )
}
```

- [x] **Step 3: Move support surfaces into expanded tools panel**

Extend `ProfileToolsPanelProps` with:

```ts
artifact: LocalArtifact | null
artifactPreview: SoulArtifactPreviewState
onPromoteProfileRevision: () => Promise<void> | void
profileRevisionSubmitting: boolean
reviewGuardrails: readonly string[]
```

At the top of the tools scroll, render support sections before recent sessions:

```tsx
<section className="hr-tool-section" aria-label={labels.sourcesTitle}>
  <WorkbenchSectionTitle icon={<FileText size={15} />} title={labels.sourcesTitle} detail={labels.sourcesDetail} />
  <div className="hr-source-grid">
    {labels.sourceCards(
      focusedProfile?.artifacts.length ?? 0,
      focusedProfile?.sessions.length ?? 0,
      focusedProfile?.reviews.length ?? 0,
    ).map(source => (
      <div key={source.label} className="hr-source-row">
        <span>{source.label}</span>
        <strong>{source.count}</strong>
        <small>{source.detail}</small>
      </div>
    ))}
  </div>
</section>

<section className="hr-tool-section" aria-label={labels.artifactPreviewTitle} data-testid="hr-proposed-change">
  <WorkbenchSectionTitle icon={<FileCheck2 size={15} />} title={labels.artifactPreviewTitle} detail={artifact ? formatRelativeTime(artifact.updatedAt, locale) : labels.artifactPreviewDetail} />
  {artifact ? <strong className="hr-artifact-preview-name">{artifact.title}</strong> : null}
  {renderArtifactPreview({ artifact, artifactPreview, empty: labels.artifactPreviewEmpty, error: labels.artifactPreviewError, loading: labels.artifactPreviewLoading })}
  <div className="hr-proposed-change-actions">
    <span className="hr-muted-note">{labels.promoteProfileRevisionHint}</span>
    <button type="button" className="secondary hr-profile-promote-button" disabled={!artifact || profileRevisionSubmitting} onClick={() => void onPromoteProfileRevision()}>
      <CheckCircle2 aria-hidden="true" size={14} />
      <span>{profileRevisionSubmitting ? labels.approvingProfileRevision : labels.approveProfileRevision}</span>
    </button>
  </div>
</section>

<section className="hr-tool-section" aria-label={labels.guardrailsTitle}>
  <WorkbenchSectionTitle icon={<ListChecks size={15} />} title={labels.guardrailsTitle} detail={labels.guardrailsDetail} />
  <ul className="hr-guardrail-list">
    {reviewGuardrails.map(item => <li key={item}>{item}</li>)}
  </ul>
</section>
```

Include local `renderArtifactPreview` helper copied from the previous
`profile-details.tsx` implementation.

- [x] **Step 4: Change index tools state**

In `index.tsx`, replace:

```ts
const [profileToolsVisible, setProfileToolsVisible] = useState(true)
```

with:

```ts
const [profileToolsExpanded, setProfileToolsExpanded] = useState(false)
```

Update drawer action handling:

```ts
if (action.slot === 'drawer-toggle') {
  setProfileToolsExpanded(expanded => !expanded)
  return
}
```

Update layout class:

```tsx
<div className={`hr-people-layout ${profileListVisible ? '' : 'without-profile-list'} ${profileToolsExpanded ? '' : 'with-tools-rail'}`}>
```

Update header button:

```tsx
<IconButton
  aria-label={profileToolsExpanded ? labels.collapseProfileTools : labels.expandProfileTools}
  aria-pressed={profileToolsExpanded}
  onClick={() => setProfileToolsExpanded(expanded => !expanded)}
>
  {profileToolsExpanded ? <PanelRightClose aria-hidden="true" size={16} /> : <PanelRightOpen aria-hidden="true" size={16} />}
</IconButton>
```

Render rail or panel:

```tsx
{profileToolsExpanded
  ? (
      <HrProfileToolsPanel
        activeActions={activeActions}
        artifact={selectedArtifact}
        artifactPreview={artifactPreview}
        copy={copy}
        engineReadiness={engineReadiness}
        focusedProfile={focusedProfile}
        labels={labels}
        locale={locale}
        profileRevisionSubmitting={profileRevisionSubmitting}
        reviewGuardrails={reviewGuardrails}
        selectedTemplate={selectedTemplate}
        selectedWorkspace={selectedWorkspace}
        submitting={submitting}
        templates={templates}
        value={value}
        onActionSelect={onActionSelect}
        onContextChange={onContextChange}
        onOpenSession={onOpenSession}
        onPromoteProfileRevision={onPromoteProfileRevision}
        onSubmitSession={onSubmitSession}
        onTemplateChange={onTemplateChange}
      />
    )
  : <HrProfileToolsRail labels={labels} onExpand={() => setProfileToolsExpanded(true)} />}
```

- [x] **Step 5: Update integration tests**

In the specialized HR workbench test:

```ts
expect(screen.getByRole('button', { name: 'Expand Profile Tools' })).toBeTruthy()
expect(screen.getByLabelText('Collapsed Profile Tools')).toBeTruthy()
expect(screen.queryByText('Profile sources')).toBeNull()
expect(screen.queryByText('Proposed Change')).toBeNull()

fireEvent.click(screen.getByRole('button', { name: 'Open Proposed Change' }))
expect(await screen.findByText('Proposed Change')).toBeTruthy()
expect(await screen.findByText('Evidence summary.')).toBeTruthy()
```

In the promotion test, open the drawer before finding proposed change:

```ts
fireEvent.click(screen.getByRole('button', { name: 'Open Proposed Change' }))
const proposedChange = await screen.findByTestId('hr-proposed-change')
```

In the panel toggles test, update expectations to rail/drawer:

```ts
expect(document.querySelector('.hr-profile-tools-rail')).toBeTruthy()
expect(document.querySelector('.hr-profile-tools-panel')).toBeNull()
fireEvent.click(screen.getByRole('button', { name: 'Expand Profile Tools' }))
expect(document.querySelector('.hr-profile-tools-panel')).toBeTruthy()
expect(document.querySelector('.hr-profile-tools-rail')).toBeNull()
fireEvent.click(screen.getByRole('button', { name: 'Collapse Profile Tools' }))
expect(document.querySelector('.hr-profile-tools-rail')).toBeTruthy()
```

- [x] **Step 6: Run focused Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx
```

Expected: Tests pass or expose CSS/query issues to fix in Task 6.

## Task 6: CSS Full-Height Reading Layout

**Files:**
- Modify: `apps/web/src/worker/souls/hr/people-workbench/styles.css`

- [x] **Step 1: Update grid columns without removing independent scroll**

Change layout rules to keep three columns and collapse the right column to rail
width:

```css
.hr-people-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 0.28fr) minmax(560px, 1fr) minmax(336px, 0.34fr);
  gap: 14px;
  align-items: stretch;
}

.hr-people-layout.with-tools-rail {
  grid-template-columns: minmax(220px, 0.28fr) minmax(620px, 1fr) 48px;
}

.hr-people-layout.without-profile-list {
  grid-template-columns: minmax(620px, 1fr) minmax(336px, 0.34fr);
}

.hr-people-layout.without-profile-list.with-tools-rail {
  grid-template-columns: minmax(0, 1fr) 48px;
}
```

- [x] **Step 2: Add Reading Room styles**

Add:

```css
.hr-reading-room {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hr-reading-summary,
.hr-reading-section {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}

.hr-reading-summary {
  border-color: var(--accent);
  background: var(--accent-tint);
}

.hr-reading-summary h2,
.hr-reading-section h3,
.hr-reading-unknown-section h4 {
  margin: 0 0 10px;
  color: var(--text-strong);
}

.hr-reading-summary h2 {
  font-size: 18px;
}

.hr-reading-section h3 {
  font-size: 14px;
}

.hr-reading-section-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.hr-reading-markdown {
  min-height: auto;
  max-height: none;
}
```

- [x] **Step 3: Add rail styles**

Add:

```css
.hr-profile-tools-rail {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
}

.hr-tools-rail-button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text-muted);
}

.hr-tools-rail-button:hover,
.hr-tools-rail-button:focus-visible {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--text-strong);
}
```

- [x] **Step 4: Keep responsive behavior safe**

Update the existing media query so mobile/narrow viewports stack in a readable
order while desktop keeps three columns:

```css
@media (max-width: 980px) {
  .hr-people-layout,
  .hr-people-layout.with-tools-rail,
  .hr-people-layout.without-profile-list,
  .hr-people-layout.without-profile-list.with-tools-rail {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [x] **Step 5: Run CSS and Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' build
```

Expected: PASS. Build also runs `check:studio-css`.

## Task 7: PMA Closeout, Changelog, Review, Verification

**Files:**
- Modify: `docs/task/FEAT-093.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-340.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run focused verification**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' build
git diff --check
```

Expected: all pass.

- [x] **Step 2: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: both complete successfully; review output contains no blocking finding.

- [x] **Step 3: Update PMA task detail**

Append to `docs/task/FEAT-093.md` ActiveForm:

```md
- 2026-05-17: Completed HR Profile Reading Room. README now has a plain
  base-section profile contract, Worker Web renders accepted profiles through a
  section-aware Reading Room, and right-side support surfaces default to a
  collapsed tools rail while preserving three independent scroll columns.
- 2026-05-17: Verification passed: core runtime profile tests, focused Web
  model/worker-studio tests, Web typecheck/build, diff check and
  code-review-graph review.
```

Change task status:

```md
- **status**: completed
```

- [x] **Step 4: Update PMA plan detail**

Set `docs/plan/PLAN-340.md`:

```md
- **status**: completed
- **completedAt**: 2026-05-17
```

Replace the initial verification note with the exact command results from Task
7 Step 1 and Task 7 Step 2.

- [x] **Step 5: Update PMA indexes**

Change:

```md
- [-] [**FEAT-093 HR Profile Reading Room**](FEAT-093.md) `P0`
- [-] [**PLAN-340 HR Profile Reading Room**](PLAN-340.md) `2026-05-17`
```

to:

```md
- [x] [**FEAT-093 HR Profile Reading Room**](FEAT-093.md) `P0`
- [x] [**PLAN-340 HR Profile Reading Room**](PLAN-340.md) `2026-05-17`
```

- [x] **Step 6: Add changelog entry**

Run:

```bash
date '+%Y-%m-%d %H:%M'
```

Add near the top of `docs/changelog.md`. The timestamp below was captured while
writing this plan; if implementation closes later, replace only the timestamp
with the output of the `date` command from this step.

```md
## 2026-05-17 00:23 [progress]

FEAT-093 / PLAN-340 completed the HR Profile Reading Room. HR profile
workspaces now seed a plain Markdown README base-section contract, Worker Web
parses the accepted README into a profile-first Reading Room, and sources,
proposed changes, guardrails and sessions default to a collapsed right-side
tools rail while preserving the three independent full-height workbench scroll
columns.

Verification passed: core runtime profile tests, focused Web model and
worker-studio tests, Web typecheck, Web build, diff check and code-review-graph
review.
```

- [x] **Step 7: Commit final implementation**

Run:

```bash
git status --short
git add apps/aiworker-hr/engine-assets/workspace/README.md packages/core/src/worker/profile-ledger.ts packages/core/src/worker/runtime.test.ts apps/web/src/worker/souls/hr/people-workbench apps/web/src/worker/__tests__/worker-studio.test.tsx docs/task/FEAT-093.md docs/task/index.md docs/plan/PLAN-340.md docs/plan/index.md docs/changelog.md docs/superpowers/plans/2026-05-17-hr-profile-reading-room.md
git commit -m "feat: add HR Profile Reading Room"
```

Expected: commit succeeds. Do not stage `.superpowers/`.
